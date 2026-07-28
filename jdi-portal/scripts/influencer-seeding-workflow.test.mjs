// 인플루언서 시딩 업무 흐름 정적 검사
// 설계서: docs/superpowers/specs/2026-07-28-influencer-seeding-workflow-design.md
// 계획서: docs/superpowers/plans/2026-07-28-influencer-seeding-workflow.md
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const read = (p) => readFileSync(join(process.cwd(), p), "utf8");
const exists = (p) => existsSync(join(process.cwd(), p));
const MIG_111 = "supabase/migrations/111_influencer_seeding_workflow.sql";

test("111: 새 테이블 6종 + RLS", () => {
  assert.ok(exists(MIG_111), `${MIG_111} 이 없습니다`);
  const sql = read(MIG_111);
  for (const t of [
    "influencer_contacts",
    "influencer_documents",
    "influencer_document_versions",
    "influencer_document_cleanup_queue",
    "influencer_campaign_events",
    "vault_unlock_sessions",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE (IF NOT EXISTS )?public\\.${t}`), `${t} 테이블 없음`);
    assert.match(
      sql,
      new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`),
      `${t} RLS 미활성`
    );
  }
  assert.match(sql, /is_approved_user\(\)/);
  assert.doesNotMatch(sql, /CURRENT_DATE/);
});

test("111: 협의 이력은 수정 불가(UPDATE 정책 없음)", () => {
  const sql = read(MIG_111);
  const updatePolicies = sql.match(
    /CREATE POLICY[^;]*ON public\.influencer_campaign_events FOR UPDATE/g
  );
  assert.equal(updatePolicies, null, "협의 이력에 UPDATE 정책이 있으면 안 됩니다");
});

test("111: 잠금 세션은 직접 조작 불가 — 쓰기 정책 없음 + DEFINER 함수만", () => {
  const sql = read(MIG_111);
  for (const op of ["INSERT", "UPDATE", "DELETE"]) {
    const re = new RegExp(`ON public\\.vault_unlock_sessions FOR ${op}`);
    assert.doesNotMatch(sql, re, `잠금 세션에 ${op} 정책이 있으면 비밀번호를 우회할 수 있습니다`);
  }
  assert.match(sql, /FUNCTION public\.vault_unlock\(p_password TEXT\)[\s\S]*?SECURITY DEFINER/);
  assert.match(sql, /FUNCTION public\.has_vault_unlock\(\)[\s\S]*?SECURITY DEFINER/);
  assert.match(sql, /SET search_path/);
});

test("111: 민감 서류는 잠금 없이는 읽을 수 없다(스토리지 정책)", () => {
  const sql = read(MIG_111);
  assert.match(sql, /'influencer-documents', 'influencer-documents', FALSE/);
  // 경로 2번째 조각이 'sensitive' 면 잠금 필요
  assert.match(sql, /split_part\(name, '\/', 2\) <> 'sensitive'/);
  assert.match(sql, /public\.has_vault_unlock\(\)/);
});

test("111: 민감 종류는 트리거로 강제된다", () => {
  const sql = read(MIG_111);
  assert.match(sql, /kind IN \('contract', ?'id_card', ?'bankbook', ?'etc'\)/);
  assert.match(sql, /CREATE TRIGGER influencer_documents_force_sensitive/);
  assert.match(sql, /NEW\.is_sensitive := NEW\.kind IN \('id_card', ?'bankbook'\)/);
});

test("111: 지출 연동 준비 — seeding 소스 + 비민감 카테고리", () => {
  const sql = read(MIG_111);
  assert.match(sql, /expenses_source_check/);
  assert.match(sql, /'seeding'/);
  assert.match(sql, /'인플루언서 시딩'[\s\S]*?FALSE/);
});

test("111: 캠페인에 배송·지급 컬럼 추가", () => {
  const sql = read(MIG_111);
  for (const c of ["courier", "tracking_number", "payout_status", "paid_at", "expense_id"]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${c}`), `${c} 컬럼 없음`);
  }
  assert.match(sql, /payout_status[\s\S]*?CHECK[\s\S]*?'none'[\s\S]*?'pending'[\s\S]*?'paid'/);
});

test("게이트: requireUnlock 이 공유 모듈로 분리되고 중복 정의가 없다", () => {
  assert.ok(exists("src/lib/vault/gate.ts"), "src/lib/vault/gate.ts 가 없습니다");
  const gate = read("src/lib/vault/gate.ts");
  assert.match(gate, /export async function requireUnlock\(userId: string\)/);

  const actions = read("src/lib/vault/actions.ts");
  assert.doesNotMatch(
    actions,
    /^async function requireUnlock/m,
    "vault/actions.ts 에 requireUnlock 중복 정의가 남아 있습니다"
  );
  assert.match(actions, /from "\.\/gate"/);
});

test("게이트: 잠금 해제·잠금이 DB 세션 RPC 를 거친다", () => {
  const actions = read("src/lib/vault/actions.ts");
  assert.match(actions, /rpc\("vault_unlock"/, "unlockVault 가 vault_unlock RPC 를 써야 합니다");
  assert.match(actions, /rpc\("vault_lock"\)/, "lockVault 가 vault_lock RPC 를 써야 합니다");
  assert.doesNotMatch(
    actions,
    /rpc\("verify_vault_gate"/,
    "쿠키만 세우면 DB 세션이 없어 스토리지가 막힙니다"
  );
});
