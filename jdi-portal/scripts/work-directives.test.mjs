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
