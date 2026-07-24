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
