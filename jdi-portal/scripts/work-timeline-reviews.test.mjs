import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p) => readFileSync(join(process.cwd(), p), "utf8");

// 대시보드 검토 인박스(pendingReviews)는 빠른 경로(fast-queries.ts, 직접 Postgres)와
// 폴백 경로(queries.ts, Supabase RPC/쿼리) 양쪽에 반드시 같은 결과를 실어야 한다.
// 한쪽만 고치면 운영에서만 안 보이는 사고가 난다 (CLAUDE.md 성능 불변조건 3).
// work-directives.test.mjs 의 "대시보드: 미확인 지시를 빠른 경로와 폴백 양쪽에 싣는다" 와 같은 패턴.
test("대시보드: 검토 인박스를 빠른 경로와 폴백 양쪽에 싣는다 (성능 불변조건 3)", () => {
  const fast = read("src/lib/dashboard/fast-queries.ts");

  // 같은 스냅샷 쿼리 안에서 처리 — DB 왕복을 늘리지 않는다
  assert.match(fast, /work_timeline_reviews/);
  // 마이그레이션 108 의 부분 인덱스를 타야 한다: author_id + state = 'open' (보완 필요)
  assert.match(fast, /r\.author_id = prm\.user_id and r\.state = 'open'/);
  // 부분 인덱스: reviewer_id + state = 'submitted' (확인 필요)
  assert.match(fast, /r\.reviewer_id = prm\.user_id and r\.state = 'submitted'/);
  // 결과가 pendingReviews.toFix / toConfirm 으로 노출된다
  assert.match(fast, /'pendingReviews'/);
  assert.match(fast, /'toFix'/);
  assert.match(fast, /'toConfirm'/);
  // 방향(마이그레이션 118): requested_by = author_id 면 작성자가 보낸 확인 요청
  // ::text 는 필수다 — jsonb_build_object(VARIADIC "any") 는 타입이 unknown 인 인자를 거부한다
  const fastDirection = fast.match(
    /'direction', \(case when r\.requested_by = r\.author_id then 'requested' else 'assigned' end\)::text/g,
  );
  assert.equal(
    fastDirection?.length,
    2,
    "빠른 경로의 toFix / toConfirm 두 CTE 모두 direction 을 실어야 합니다",
  );

  const fallback = read("src/lib/dashboard/queries.ts");

  assert.match(fallback, /from\("work_timeline_reviews"\)/);
  // toFix: 내가 보완해야 할 검토 — author_id = 나, state = open
  assert.match(fallback, /\.eq\("author_id", userId\)[\s\S]{0,40}\.eq\("state", "open"\)/);
  // toConfirm: 내가 확인해야 할 검토 — reviewer_id = 나, state = submitted
  assert.match(fallback, /\.eq\("reviewer_id", userId\)[\s\S]{0,40}\.eq\("state", "submitted"\)/);
  // 폴백도 pendingReviews 를 반환해 스냅샷 빌더에 넘긴다
  assert.match(fallback, /pendingReviews/);
  assert.match(fallback, /getPendingReviews/);
  // Supabase error 무시 금지
  assert.match(fallback, /if \(toFixResult\.error\) throw toFixResult\.error;/);
  assert.match(fallback, /if \(toConfirmResult\.error\) throw toConfirmResult\.error;/);
  // 방향(마이그레이션 118): 빠른 경로의 case 식과 같은 규칙으로 계산해야 한다
  const fallbackSelects = fallback.match(/author_id, requested_by, work_timeline_entries\(title\)/g);
  assert.equal(
    fallbackSelects?.length,
    2,
    "폴백의 toFix / toConfirm 두 쿼리 모두 author_id · requested_by 를 읽어야 합니다",
  );
  assert.match(
    fallback,
    /direction: row\.requested_by === row\.author_id \? "requested" : "assigned"/,
  );
});

// 아래 두 테스트는 work-directives.test.mjs 의
// "103 마이그레이션: 테이블 2개 + 연결 컬럼 + RLS" /
// "103 마이그레이션: 수락/거절 RPC 의 권한 재검증" 과 대칭인 보안 회귀 검사다.
test("108 마이그레이션: RLS 활성 + SELECT 정책은 당사자·관리자로 제한, 쓰기 정책 없음", () => {
  const path = "supabase/migrations/108_work_timeline_reviews.sql";
  const sql = read(path);

  // RLS 활성 — 두 테이블 모두
  assert.match(sql, /ALTER TABLE public\.work_timeline_reviews ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.work_timeline_review_events ENABLE ROW LEVEL SECURITY/);

  const rlsBlock = sql.slice(
    sql.indexOf("-- ---------- RLS ----------"),
    sql.indexOf("-- ---------- 보완 할일 완료 감지 ----------"),
  );
  assert.ok(rlsBlock.length > 0, "RLS 섹션을 찾지 못했습니다");

  // 승인 사용자 확인
  assert.match(rlsBlock, /is_approved_user\(\)/);

  // work_timeline_reviews SELECT 정책: 검토자·작성자·관리자만
  assert.match(rlsBlock, /ON public\.work_timeline_reviews FOR SELECT TO authenticated/);
  assert.match(rlsBlock, /reviewer_id = auth\.uid\(\)/);
  assert.match(rlsBlock, /author_id = auth\.uid\(\)/);
  assert.match(rlsBlock, /p\.role = 'admin'/);

  // work_timeline_review_events SELECT 정책: 연결된 검토를 볼 수 있으면 조회
  assert.match(rlsBlock, /ON public\.work_timeline_review_events FOR SELECT TO authenticated/);
  assert.match(
    rlsBlock,
    /FROM public\.work_timeline_reviews r\s*\n\s*WHERE r\.id = work_timeline_review_events\.review_id/,
  );

  // INSERT/UPDATE/DELETE 정책은 없다 — 쓰기는 RPC(SECURITY DEFINER) 전용
  assert.doesNotMatch(
    rlsBlock,
    /FOR (INSERT|UPDATE|DELETE) TO authenticated/,
    "work_timeline_reviews/_events 에는 쓰기 정책이 있으면 안 됩니다 (RPC 전용)",
  );
});

test("108 마이그레이션: 검토 RPC 4개는 SECURITY DEFINER + search_path 고정 + auth.uid() 검증 + 최소 권한 부여", () => {
  const path = "supabase/migrations/108_work_timeline_reviews.sql";
  const sql = read(path);

  const rpcs = [
    { name: "request_timeline_review", signature: "request_timeline_review(UUID, TEXT)" },
    { name: "approve_timeline_review", signature: "approve_timeline_review(UUID, TEXT)" },
    { name: "reject_timeline_review", signature: "reject_timeline_review(UUID, TEXT)" },
    { name: "cancel_timeline_review", signature: "cancel_timeline_review(UUID)" },
  ];

  for (const { name, signature } of rpcs) {
    const startMarker = `FUNCTION public.${name}(`;
    const revokeMarker = `REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC;`;
    const grantMarker = `GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated;`;

    const start = sql.indexOf(startMarker);
    assert.ok(start >= 0, `${name} 함수 정의를 찾지 못했습니다`);
    const revokeIdx = sql.indexOf(revokeMarker);
    assert.ok(revokeIdx >= 0, `${name}: REVOKE ALL ... FROM PUBLIC 이 없습니다`);
    assert.ok(sql.includes(grantMarker), `${name}: GRANT EXECUTE ... TO authenticated 가 없습니다`);

    const body = sql.slice(start, revokeIdx);
    assert.match(body, /SECURITY DEFINER/, `${name}: SECURITY DEFINER 가 없습니다`);
    assert.match(body, /SET search_path = public/, `${name}: search_path 고정이 없습니다`);
    // 세션 사용자를 신뢰하지 않고 auth.uid() 로 직접 재검증한다
    // (approve/reject/cancel 은 공통 헬퍼 assert_can_resolve_review 를 통해 검증)
    assert.match(body, /auth\.uid\(\)/, `${name}: auth.uid() 검증이 없습니다`);
  }

  // 승인/반려/취소는 공통 권한 헬퍼로 검토자·관리자만 처리하도록 강제한다
  const helperCalls = (sql.match(/PERFORM public\.assert_can_resolve_review\(v_rev\);/g) ?? []).length;
  assert.ok(
    helperCalls >= 3,
    `approve/reject/cancel 각각 assert_can_resolve_review 로 권한을 재검증해야 합니다 (현재 ${helperCalls})`,
  );
});

// ---- v2 (마이그레이션 109): 할일 연동 제거 + 보완 제출 RPC + 첨부 테이블 ----
// 현재 유효 동작은 109 기준이다. 108 은 원격에 이미 적용됐고 수정하지 않지만,
// 109 가 그 위에 얹혀 할일 연동을 제거하고 보완 제출 흐름을 신설한다.

test("109 마이그레이션: 할일 연동(tasks.review_id 등) 제거", () => {
  const sql = read("supabase/migrations/109_work_timeline_review_v2.sql");

  // tasks.review_id 컬럼과 유니크 인덱스, 완료 감지 트리거·함수를 되돌린다
  assert.match(sql, /ALTER TABLE public\.tasks DROP COLUMN IF EXISTS review_id/);
  assert.match(sql, /DROP INDEX IF EXISTS public\.tasks_review_unique/);
  assert.match(sql, /DROP TRIGGER IF EXISTS tasks_sync_review_on_status ON public\.tasks/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.sync_review_on_task_status\(\)/);
  assert.match(sql, /ALTER TABLE public\.work_timeline_reviews DROP COLUMN IF EXISTS task_id/);

  // v2 의 상태 전이 RPC 들은 더 이상 tasks 를 INSERT/UPDATE 하지 않는다 (보완은 업무보고 검토 칸에서만)
  assert.doesNotMatch(sql, /INSERT INTO public\.tasks\b/, "109 RPC 는 tasks 를 생성하면 안 됩니다");
  assert.doesNotMatch(sql, /UPDATE public\.tasks\b/, "109 RPC 는 tasks 를 수정하면 안 됩니다");
});

test("109 마이그레이션: 보완 제출 RPC 는 SECURITY DEFINER + search_path + 작성자 검증 + 최소 권한", () => {
  const sql = read("supabase/migrations/109_work_timeline_review_v2.sql");

  const start = sql.indexOf("FUNCTION public.submit_timeline_review_remediation(");
  assert.ok(start >= 0, "submit_timeline_review_remediation 정의를 찾지 못했습니다");
  const revokeMarker =
    "REVOKE ALL ON FUNCTION public.submit_timeline_review_remediation(UUID, TEXT, JSONB) FROM PUBLIC;";
  const grantMarker =
    "GRANT EXECUTE ON FUNCTION public.submit_timeline_review_remediation(UUID, TEXT, JSONB) TO authenticated;";
  const revokeIdx = sql.indexOf(revokeMarker);
  assert.ok(revokeIdx >= 0, "submit_...: REVOKE ALL ... FROM PUBLIC 이 없습니다");
  assert.ok(sql.includes(grantMarker), "submit_...: GRANT EXECUTE ... TO authenticated 가 없습니다");

  const body = sql.slice(start, revokeIdx);
  assert.match(body, /SECURITY DEFINER/, "submit_...: SECURITY DEFINER 가 없습니다");
  assert.match(body, /SET search_path = public/, "submit_...: search_path 고정이 없습니다");
  assert.match(body, /auth\.uid\(\)/, "submit_...: auth.uid() 검증이 없습니다");
  // 보완은 작성자만 제출할 수 있어야 한다
  assert.match(body, /v_rev\.author_id <> v_uid/, "submit_...: 작성자 검증이 없습니다");
  // open -> submitted 전이
  assert.match(body, /state = 'submitted'/, "submit_...: submitted 전이가 없습니다");
});

test("109 마이그레이션: 검토 첨부 테이블 RLS 활성 + SELECT 정책은 당사자·관리자, 쓰기 정책 없음", () => {
  const sql = read("supabase/migrations/109_work_timeline_review_v2.sql");

  // 테이블 + RLS 활성
  assert.match(sql, /CREATE TABLE public\.work_timeline_review_attachments/);
  assert.match(
    sql,
    /ALTER TABLE public\.work_timeline_review_attachments ENABLE ROW LEVEL SECURITY/,
  );

  // SELECT 정책: 연결 검토를 볼 수 있는 사람(검토자·작성자·관리자)만
  assert.match(
    sql,
    /ON public\.work_timeline_review_attachments FOR SELECT TO authenticated/,
  );
  assert.match(sql, /is_approved_user\(\)/);
  assert.match(sql, /r\.reviewer_id = auth\.uid\(\)/);
  assert.match(sql, /r\.author_id = auth\.uid\(\)/);
  assert.match(sql, /p\.role = 'admin'/);

  // INSERT/UPDATE/DELETE 정책은 없다 — 첨부 쓰기는 RPC(SECURITY DEFINER) 전용
  assert.doesNotMatch(
    sql,
    /ON public\.work_timeline_review_attachments FOR (INSERT|UPDATE|DELETE)/,
    "검토 첨부 테이블에는 쓰기 정책이 있으면 안 됩니다 (RPC 전용)",
  );
});

// ---- v3 (마이그레이션 118): 검토 요청 방향 추가 ----
// 작성자가 검토자를 지정해 "확인해 주세요"라고 요청하는 반대 방향과 동료 간 상호 검토.
// 설계: docs/superpowers/specs/2026-08-04-work-timeline-review-request-direction-design.md

const MIGRATION_118 = "supabase/migrations/118_work_timeline_review_request_direction.sql";

test("118 마이그레이션: requested_by 컬럼 추가 + 기존 행 백필 + NOT NULL", () => {
  const sql = read(MIGRATION_118);

  assert.match(sql, /ADD COLUMN IF NOT EXISTS requested_by UUID/);
  assert.match(sql, /REFERENCES public\.profiles\(id\) ON DELETE CASCADE/);
  // v1/v2 는 "요청자 = 검토자" 였으므로 reviewer_id 로 백필해야 의미가 보존된다
  assert.match(sql, /SET requested_by = reviewer_id\s*\n\s*WHERE requested_by IS NULL/);
  assert.match(sql, /ALTER COLUMN requested_by SET NOT NULL/);
});

test("118 마이그레이션: 구 2인자 request_timeline_review 를 지우고 3인자로 교체", () => {
  const sql = read(MIGRATION_118);

  // DEFAULT 로 얹으면 오버로드가 공존해 2인자 호출이 모호해진다 — 반드시 DROP
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.request_timeline_review\(UUID, TEXT\);/);
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.request_timeline_review\(\s*\n\s*p_entry_id UUID,\s*\n\s*p_comment TEXT,\s*\n\s*p_reviewer_id UUID\s*\n\s*\)/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.request_timeline_review\(UUID, TEXT, UUID\) FROM PUBLIC;/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.request_timeline_review\(UUID, TEXT, UUID\) TO authenticated;/,
  );

  // 서버 액션도 3인자로 부른다 (한쪽만 바뀌면 운영에서 함수를 못 찾는다)
  const actions = read("src/lib/work-timeline/reviewActions.ts");
  assert.match(actions, /p_entry_id: entryId, p_comment: trimmed, p_reviewer_id: reviewerId \?\? null/);
});

test("118 마이그레이션: 검토 요청 RPC 의 권한·방향 판정", () => {
  const sql = read(MIGRATION_118);

  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.request_timeline_review(");
  const end = sql.indexOf("REVOKE ALL ON FUNCTION public.request_timeline_review(UUID, TEXT, UUID)");
  assert.ok(start >= 0 && end > start, "request_timeline_review 정의를 찾지 못했습니다");
  const body = sql.slice(start, end);

  assert.match(body, /SECURITY DEFINER/);
  assert.match(body, /SET search_path = public/);
  // 세션 사용자를 믿지 않고 auth.uid() 로 재검증
  assert.match(body, /v_uid := auth\.uid\(\)/);
  assert.match(body, /p\.is_approved = true/);

  // 방향은 서버가 판정한다 — 클라이언트가 모드를 고르지 않는다
  assert.match(body, /v_is_self_request := \(v_entry\.user_id = v_uid\)/);
  // 확인요청형: 검토자 필수 · 본인 지정 금지 · 승인 사용자 확인 · submitted 로 시작
  assert.match(body, /IF p_reviewer_id IS NULL THEN/);
  assert.match(body, /IF p_reviewer_id = v_uid THEN/, "자기 자신을 검토자로 지정하지 못하게 막아야 합니다");
  assert.match(body, /WHERE p\.id = p_reviewer_id AND p\.is_approved = true/);
  assert.match(body, /v_state := 'submitted'/);
  // 지시형: 관리자만
  assert.match(body, /IF NOT v_is_admin THEN\s*\n\s*RAISE EXCEPTION '검토를 요청할 권한이 없습니다\.'/);
  assert.match(body, /v_state := 'open'/);

  // 진행 중 1건 제한 유지
  assert.match(body, /r\.state IN \('open', 'submitted'\)[\s\S]{0,120}이미 진행 중인 검토가 있습니다/);
  // 요청자를 반드시 기록
  assert.match(body, /\(entry_id, reviewer_id, author_id, requested_by, comment, state\)/);
});

test("118 마이그레이션: 취소 권한이 '요청한 사람' 기준으로 바뀐다", () => {
  const sql = read(MIGRATION_118);

  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.cancel_timeline_review(");
  const end = sql.indexOf("REVOKE ALL ON FUNCTION public.cancel_timeline_review(UUID) FROM PUBLIC;");
  assert.ok(start >= 0 && end > start, "cancel_timeline_review 정의를 찾지 못했습니다");
  const body = sql.slice(start, end);

  assert.match(body, /SECURITY DEFINER/);
  assert.match(body, /SET search_path = public/);
  // 확인요청형은 요청자가 검토자가 아니므로 검토자 기준 헬퍼로는 자기 요청을 못 지운다
  assert.doesNotMatch(
    body,
    /assert_can_resolve_review/,
    "취소는 검토자 기준 헬퍼가 아니라 requested_by 로 판정해야 합니다",
  );
  assert.match(body, /v_rev\.requested_by <> v_uid/);
  assert.match(body, /p\.role = 'admin'/);
  assert.match(body, /v_rev\.state NOT IN \('open', 'submitted'\)/);
});

test("대시보드 검토함: 항상 펼침(접기 가능) + 3건 남짓 스크롤 + 항목이 상세로 연결", () => {
  const widget = read("src/components/dashboard/widgets/ReviewInboxWidget.tsx");

  assert.match(widget, /^"use client";/);
  // 0건이면 칸 자체를 그리지 않는다
  assert.match(widget, /if \(total === 0\) return null;/);
  // 출근해야 펼쳐지던 게이트를 되살리지 않는다 — 놓치면 안 되는 인박스다
  assert.doesNotMatch(
    widget,
    /hasCheckedIn|attendanceStatuses/,
    "검토함은 출근 여부와 무관하게 펼쳐져 있어야 합니다",
  );
  // 기본값은 펼침, 사용자가 원하면 접을 수 있다
  assert.match(widget, /useState\(false\)/);
  assert.match(widget, /setCollapsed\(\(value\) => !value\)/);
  assert.match(widget, /aria-expanded=\{!collapsed\}/);
  // 목록이 길어져도 대시보드가 늘어나지 않도록 칸 안에서만 스크롤
  assert.match(widget, /max-h-\[29rem\][^"]*overflow-y-auto/);
  // 항목을 누르면 업무보고 상세로 간다
  assert.match(widget, /href=\{`\/dashboard\/work-timeline\/\$\{item\.entryId\}`\}/);
  // 승인/반려는 링크 밖에 있어야 한다 (버튼 눌렀는데 페이지가 넘어가면 안 됨)
  const linkComponent = widget.slice(widget.indexOf("function ReviewItemLink"));
  assert.doesNotMatch(
    linkComponent,
    /approveReview|rejectReview|onClick/,
    "링크 컴포넌트 안에 처리 버튼이 들어가면 안 됩니다",
  );
});

test("118: 화면이 요청자 기준으로 취소 버튼을 노출한다", () => {
  const section = read("src/components/dashboard/work-timeline/WorkTimelineReviewSection.tsx");

  // 기존 조건(isReviewer && open)이면 확인요청형(submitted 로 시작)은 취소가 아예 불가능하다
  assert.match(
    section,
    /review\.requested_by === currentUserId\s*\n?\s*&& \(review\.state === "open" \|\| review\.state === "submitted"\)/,
  );
  // 검토자 선택 드롭다운은 내 업무보고일 때만
  assert.match(section, /isOwnEntry && \(/);
  assert.match(section, /검토받을 사람/);
  assert.match(section, /requestReview\(entryId, comment, isOwnEntry \? reviewerId : null\)/);
});
