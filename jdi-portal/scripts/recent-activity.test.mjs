import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";

const appRoot = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return readFileSync(path.join(appRoot, relativePath), "utf8");
}

function loadModule(relativePath) {
  const require = createRequire(import.meta.url);
  const typescript = require(path.join(appRoot, "node_modules", "typescript"));
  const compiled = typescript.transpileModule(read(relativePath), {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("exports", "module", "require", compiled)(
    compiledModule.exports,
    compiledModule,
    require,
  );
  return compiledModule.exports;
}

function entry(overrides) {
  return {
    id: "activity-1",
    actor_id: "user-1",
    actor_name: "홍길동",
    entity_type: "task",
    entity_id: "task-1",
    entity_title: "코스콤 계약관련 확인",
    action: "update",
    field: null,
    old_value: null,
    new_value: null,
    created_at: "2026-07-28T06:41:00.000Z",
    ...overrides,
  };
}

test("최근 활동: 빠른 경로와 폴백 양쪽에서 읽는다 (성능 불변조건 3)", () => {
  const fast = read("src/lib/dashboard/fast-queries.ts");
  assert.match(fast, /recent_activities as \(/);
  assert.match(fast, /from public\.activity_log al/);
  assert.match(fast, /'recentActivities', \(select value from recent_activities\)/);
  // 오늘(KST) 범위는 기존 parameters CTE 를 재사용해야 한다.
  assert.match(fast, /al\.created_at >= prm\.day_start/);

  const fallback = read("src/lib/dashboard/queries.ts");
  assert.match(fallback, /\.from\("activity_log"\)/);
  assert.match(fallback, /getRecentActivities\(supabase, taskSummaryWindow\)/);
});

test("최근 활동: 대시보드 스냅샷은 여전히 DB 왕복 1회다", () => {
  const fast = read("src/lib/dashboard/fast-queries.ts");
  assert.equal((fast.match(/pool\.query/g) ?? []).length, 1);
  // 하드코딩된 빈 배열로 되돌아가면 카드가 영원히 비어버린다.
  assert.doesNotMatch(fast, /recentActivities: \[\]/);
  assert.doesNotMatch(read("src/lib/dashboard/queries.ts"), /recentActivities: \[\]/);
});

test("최근 활동: 기록은 트리거만 남기고 아무도 고칠 수 없다", () => {
  const migration = read("supabase/migrations/117_activity_log.sql");

  assert.match(migration, /CREATE POLICY "Approved users can view activity log"/);
  assert.match(migration, /public\.is_approved_user\(\)/);
  // 앱에서 위조 기록을 넣거나 기록을 지울 수 없어야 한다.
  assert.doesNotMatch(migration, /ON public\.activity_log FOR (INSERT|UPDATE|DELETE)/);
  // 시스템 작업(배치·마이그레이션)은 기록하지 않는다.
  assert.match(migration, /IF v_actor IS NULL THEN\s*\n\s*RETURN;/);
  // 개인 일정 제목이 전 직원에게 새어나가면 안 된다.
  assert.match(migration, /IF NEW\.visibility <> 'company' THEN/);
  assert.match(migration, /IF OLD\.visibility <> 'company' THEN/);
});

test("최근 활동: 7일 지난 기록은 자동으로 지운다", () => {
  const migration = read("supabase/migrations/117_activity_log.sql");
  assert.match(migration, /cron\.schedule\(\s*'activity_log_cleanup'/);
  assert.match(migration, /DELETE FROM public\.activity_log WHERE created_at < now\(\) - interval '7 days'/);
});

test("최근 활동: 카드는 '오늘 내 할 일' 과 '오늘 일정' 사이에 있다", () => {
  const widget = read("src/components/dashboard/widgets/TodayWorkBoardWidget.tsx");
  const taskSection = widget.indexOf("{taskSectionTitle}");
  const card = widget.indexOf("<RecentActivityCard");
  const scheduleSection = widget.indexOf("오늘 일정");

  assert.ok(taskSection > 0 && card > 0 && scheduleSection > 0, "세 섹션이 모두 있어야 합니다");
  assert.ok(taskSection < card, "최근 활동 카드는 오늘 내 할 일 아래에 있어야 합니다");
  assert.ok(card < scheduleSection, "최근 활동 카드는 오늘 일정 위에 있어야 합니다");

  const client = read("src/components/dashboard/DashboardClient.tsx");
  assert.match(client, /recentActivities=\{data\.recentActivities\}/);
});

test("최근 활동 문장: 사실을 한국어 문장으로 조립한다", () => {
  const { describeActivity, activityHref } = loadModule("src/lib/activity/format.ts");

  assert.equal(
    describeActivity(entry({ field: "due_date", old_value: "2026-03-05", new_value: "2026-03-08" })).text,
    "'코스콤 계약관련 확인' 마감 3/5 → 3/8",
  );
  assert.equal(
    describeActivity(entry({ field: "due_date", old_value: null, new_value: "2026-03-08" })).text,
    "'코스콤 계약관련 확인' 마감 없음 → 3/8",
  );

  const done = describeActivity(entry({ field: "status", old_value: "진행중", new_value: "완료" }));
  assert.equal(done.text, "'코스콤 계약관련 확인' 완료");
  assert.equal(done.iconKey, "done");

  assert.equal(
    describeActivity(entry({ field: "status", old_value: "대기", new_value: "진행중" })).text,
    "'코스콤 계약관련 확인' 대기 → 진행중",
  );
  assert.equal(
    describeActivity(entry({ action: "create", entity_type: "schedule", entity_title: "주간회의" })).text,
    "일정 '주간회의' 등록",
  );
  assert.equal(
    describeActivity(entry({ action: "create", entity_type: "project", entity_title: "코스콤 계약" })).text,
    "프로젝트 '코스콤 계약' 등록",
  );
  assert.equal(
    describeActivity(entry({ field: "assignee", new_value: "박민수" })).text,
    "'코스콤 계약관련 확인' 담당자 박민수 지정",
  );

  // 삭제된 항목은 갈 곳이 없다.
  assert.equal(activityHref(entry({ action: "delete" })), null);
  assert.equal(activityHref(entry({ action: "create" })), "/dashboard/tasks/task-1");
  assert.equal(
    activityHref(entry({ entity_type: "project", entity_id: "p-1" })),
    "/dashboard/tasks?project=p-1",
  );
});

test("최근 활동 묶기: 같은 사람이 같은 대상을 5분 안에 건드리면 한 줄", () => {
  const { groupActivities } = loadModule("src/lib/activity/format.ts");

  // 최신순 입력 (마감·담당자를 한 번에 바꾼 경우)
  const groups = groupActivities([
    entry({ id: "a", field: "assignee", created_at: "2026-07-28T06:41:00.000Z" }),
    entry({ id: "b", field: "due_date", created_at: "2026-07-28T06:40:00.000Z" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].entries.length, 2);

  // 5분을 넘으면 따로
  const apart = groupActivities([
    entry({ id: "a", created_at: "2026-07-28T06:41:00.000Z" }),
    entry({ id: "b", created_at: "2026-07-28T06:30:00.000Z" }),
  ]);
  assert.equal(apart.length, 2);

  // 사람이 다르면 따로
  const others = groupActivities([
    entry({ id: "a", actor_id: "user-1", created_at: "2026-07-28T06:41:00.000Z" }),
    entry({ id: "b", actor_id: "user-2", created_at: "2026-07-28T06:40:30.000Z" }),
  ]);
  assert.equal(others.length, 2);

  // 대상이 다르면 따로
  const differentTargets = groupActivities([
    entry({ id: "a", entity_id: "task-1", created_at: "2026-07-28T06:41:00.000Z" }),
    entry({ id: "b", entity_id: "task-2", created_at: "2026-07-28T06:40:30.000Z" }),
  ]);
  assert.equal(differentTargets.length, 2);
});
