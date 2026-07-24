import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const read = (p) => readFileSync(join(process.cwd(), p), "utf8");
const exists = (p) => existsSync(join(process.cwd(), p));

test("103 마이그레이션: 테이블 2개 + 연결 컬럼 + RLS", () => {
  const path = "supabase/migrations/103_work_directives.sql";
  assert.ok(exists(path), "103_work_directives.sql 이 없습니다");
  const sql = read(path);

  assert.match(sql, /CREATE TABLE public\.work_directives/);
  assert.match(sql, /CREATE TABLE public\.work_directive_recipients/);
  assert.match(sql, /ALTER TABLE public\.tasks\s+ADD COLUMN directive_recipient_id/);

  // RLS 활성
  assert.match(sql, /ALTER TABLE public\.work_directives ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.work_directive_recipients ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_approved_user\(\)/);

  // 대시보드가 매 요청 읽는 경로 → 미확인 부분 인덱스 필수
  assert.match(sql, /work_directive_recipients_pending[\s\S]*?WHERE state = '미확인'/);

  // 중복 수락 방지
  assert.match(sql, /tasks_directive_recipient_unique[\s\S]*?WHERE directive_recipient_id IS NOT NULL/);

  // kind 위조 방지 트리거
  assert.match(sql, /CREATE TRIGGER work_directives_set_kind/);
  assert.match(sql, /NEW\.kind :=/);

  // KST 규칙: 날짜는 반드시 Asia/Seoul 변환
  assert.doesNotMatch(sql, /CURRENT_DATE/);
});

test("103 마이그레이션: 수락/거절 RPC 의 권한 재검증", () => {
  const sql = read("supabase/migrations/103_work_directives.sql");

  assert.match(sql, /FUNCTION public\.accept_work_directive\(p_recipient_id UUID\)/);
  assert.match(sql, /FUNCTION public\.decline_work_directive\(p_recipient_id UUID, p_reason TEXT\)/);

  // SECURITY DEFINER 는 search_path 고정 + 내부 재검증이 필수
  const definerCount = (sql.match(/SECURITY DEFINER/g) ?? []).length;
  assert.ok(definerCount >= 3, `SECURITY DEFINER 함수가 3개 이상이어야 합니다 (현재 ${definerCount})`);
  assert.ok(
    (sql.match(/SET search_path = public/g) ?? []).length >= 3,
    "SECURITY DEFINER 함수마다 search_path 를 고정해야 합니다",
  );
  assert.match(sql, /v_uid := auth\.uid\(\)/);

  // 대표님 지시는 거절 불가
  assert.match(sql, /대표님 지시는 거절할 수 없습니다/);
  // 중복 응답 방지
  assert.match(sql, /이미 응답한 지시입니다/);

  // 수락 시 담당자 배정까지 한 트랜잭션 안에서
  assert.match(sql, /INSERT INTO public\.task_assignees/);
});

test("104 마이그레이션: RLS 상호 재귀를 SECURITY DEFINER 헬퍼로 끊는다", () => {
  const path = "supabase/migrations/104_work_directive_rls_recursion_fix.sql";
  assert.ok(exists(path), `${path} 이 없습니다`);
  const sql = read(path);

  // RLS 우회 헬퍼 (048 과 같은 패턴)
  assert.match(sql, /FUNCTION public\.is_work_directive_sender\(p_directive_id UUID\)/);
  assert.match(sql, /FUNCTION public\.is_work_directive_recipient\(p_directive_id UUID\)/);
  assert.ok(
    (sql.match(/SECURITY DEFINER/g) ?? []).length >= 3,
    "헬퍼는 RLS 를 우회해야 하므로 SECURITY DEFINER 여야 합니다",
  );

  // 재작성된 정책에서는 상대 테이블을 직접 참조하지 않는다 (재귀 원인)
  const policyBlock = sql.slice(sql.indexOf("work_directives 정책 재작성"));
  assert.doesNotMatch(
    policyBlock,
    /FROM public\.work_directive_recipients/,
    "정책 안에서 상대 테이블을 직접 조회하면 다시 무한 재귀(42P17)가 납니다",
  );
  assert.doesNotMatch(
    policyBlock,
    /FROM public\.work_directives\b/,
    "정책 안에서 상대 테이블을 직접 조회하면 다시 무한 재귀(42P17)가 납니다",
  );
});

test("lib/directives: 모듈 구성과 서버 검증", () => {
  for (const f of ["types.ts", "constants.ts", "actions.ts"]) {
    assert.ok(exists(`src/lib/directives/${f}`), `src/lib/directives/${f} 이 없습니다`);
  }

  const actions = read("src/lib/directives/actions.ts");
  assert.match(actions, /^"use server";/);
  // 팝업(클라이언트 컴포넌트)이 부르므로 조회도 서버 액션이어야 한다
  assert.match(actions, /export async function getSentDirectivesFor/);
  // 상태 변경은 반드시 RPC 로만
  assert.match(actions, /rpc\("accept_work_directive"/);
  assert.match(actions, /rpc\("decline_work_directive"/);
  // 수신자 테이블을 클라이언트에서 직접 UPDATE 하지 않는다
  assert.doesNotMatch(actions, /from\("work_directive_recipients"\)[\s\S]{0,80}\.update\(/);
  // Supabase error 무시 금지
  assert.ok(
    (actions.match(/\.error/g) ?? []).length >= 4,
    "Supabase 응답의 error 를 매 호출마다 확인해야 합니다",
  );
  // 알림 실패가 지시 등록을 되돌리지 않는다
  assert.match(actions, /알림/);

  const constants = read("src/lib/directives/constants.ts");
  assert.match(constants, /대표님 지시/);
  assert.match(constants, /업무 요청/);
});

test("대시보드: 미확인 지시를 빠른 경로와 폴백 양쪽에 싣는다 (성능 불변조건 3)", () => {
  const fast = read("src/lib/dashboard/fast-queries.ts");
  // 같은 스냅샷 쿼리 안에서 처리 — DB 왕복을 늘리지 않는다
  assert.match(fast, /pending_directives/);
  assert.match(fast, /directive_pending_counts/);
  assert.match(fast, /'pendingDirectives'/);
  assert.match(fast, /'directivePendingCounts'/);
  // 미확인 부분 인덱스를 타야 한다
  assert.match(fast, /r\.state = '미확인'/);

  const fallback = read("src/lib/dashboard/queries.ts");
  assert.match(fallback, /pendingDirectives/);
  assert.match(fallback, /directivePendingCounts/);
  assert.match(fallback, /work_directive_recipients/);

  const snapshot = read("src/lib/dashboard/dashboard-snapshot.ts");
  assert.match(snapshot, /pendingDirectives: PendingDirective\[\]/);
  assert.match(snapshot, /directivePendingCounts: DirectivePendingCount\[\]/);
});

test("받는 쪽 위젯: 출근 연동·종류 분리·수락 흐름", () => {
  const path = "src/components/dashboard/widgets/DirectiveInboxWidget.tsx";
  assert.ok(exists(path), `${path} 이 없습니다`);
  const widget = read(path);

  assert.match(widget, /^"use client";/);
  // 출근 전에는 접힌 한 줄
  assert.match(widget, /hasCheckedIn/);
  // 종류별 배지
  assert.match(widget, /DIRECTIVE_KIND_CONFIG/);
  // 지시는 거절 불가
  assert.match(widget, /canDecline/);
  assert.match(widget, /acceptDirective/);
  assert.match(widget, /declineDirective/);
  // 수락 후 오늘 할 일과 함께 갱신
  assert.match(widget, /router\.refresh\(\)/);

  const client = read("src/components/dashboard/DashboardClient.tsx");
  assert.match(client, /DirectiveInboxWidget/);
  // 오늘 할 일 위젯보다 위에 놓인다
  assert.ok(
    client.indexOf("<DirectiveInboxWidget") < client.indexOf("<TodayWorkBoardWidget"),
    "DirectiveInboxWidget 은 TodayWorkBoardWidget 보다 위에 있어야 합니다",
  );
});

test("보내는 쪽 팝업: 오늘 업무 3줄 + 지시 작성 + 표 배지", () => {
  const path = "src/components/dashboard/widgets/MemberWorkPanel.tsx";
  assert.ok(exists(path), `${path} 이 없습니다`);
  const panel = read(path);

  assert.match(panel, /^"use client";/);
  // 대기 / 진행중 / 완료 세 줄을 한 카드에
  assert.match(panel, /대기/);
  assert.match(panel, /진행중/);
  assert.match(panel, /완료/);
  assert.match(panel, /createDirective/);
  // 보낸 지시 목록은 팝업을 열 때만 조회 (대시보드 초기 예산 보호)
  assert.match(panel, /getSentDirectivesFor/);
  assert.match(panel, /useEffect/);

  const widget = read("src/components/dashboard/widgets/TodayWorkBoardWidget.tsx");
  // 이름이 버튼이 된다 — 모바일/데스크톱 두 곳 모두
  assert.match(widget, /MemberWorkPanel/);
  assert.match(widget, /setPanelMember/);
  assert.doesNotMatch(
    widget,
    /\{profile\.full_name\}<\/p>/,
    "직원 이름은 모바일·데스크톱 두 곳 모두 버튼이어야 합니다",
  );
  // 미확인 배지
  assert.match(widget, /directivePendingCounts/);
  assert.match(widget, /미확인/);
});

test("105 마이그레이션: 미확인 재촉은 KST 기준 평일 1회", () => {
  const path = "supabase/migrations/105_work_directive_reminder.sql";
  assert.ok(exists(path), `${path} 이 없습니다`);
  const sql = read(path);

  assert.match(sql, /FUNCTION public\.remind_pending_work_directives\(\)/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = public/);
  // KST 고정
  assert.match(sql, /NOW\(\) AT TIME ZONE 'Asia\/Seoul'/);
  assert.doesNotMatch(sql, /CURRENT_DATE/);
  // 출근한 사람에게만
  assert.match(sql, /attendance_records/);
  // 하루 1회 (중복 방지)
  assert.match(sql, /reminded_on/);
  // 평일 11:00 KST = 02:00 UTC
  assert.match(sql, /cron\.schedule\(\s*'work_directive_reminder',\s*'0 2 \* \* 1-5'/);
  // 받는 사람 + 보낸 사람 양쪽 알림
  assert.match(sql, /work_directive_reminder'/);
  assert.match(sql, /work_directive_pending'/);
});

test("push-dispatch: 알림 타입 등록 + 밤 시간 푸시 차단", () => {
  const fn = read("supabase/functions/push-dispatch/index.ts");
  for (const type of [
    "work_directive",
    "work_directive_answer",
    "work_directive_reminder",
    "work_directive_pending",
  ]) {
    assert.ok(fn.includes(`${type}:`), `SETTING_KEY_BY_TYPE 에 ${type} 이 없습니다`);
  }
  // 조용한 시간
  assert.match(fn, /QUIET_HOURS/);
  assert.match(fn, /Asia\/Seoul/);
});
