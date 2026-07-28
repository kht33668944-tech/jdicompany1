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

const MIG_112 = "supabase/migrations/112_influencer_campaign_results.sql";

test("112: 성과 컬럼 + 정규화 함수 + 매칭 인덱스", () => {
  assert.ok(exists(MIG_112), `${MIG_112} 이 없습니다`);
  const sql = read(MIG_112);
  for (const c of ["result_likes", "result_comments", "result_views", "result_captured_at"]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${c}`), `${c} 컬럼 없음`);
  }
  assert.match(sql, /FUNCTION public\.normalize_post_url\(p_url text\)[\s\S]*?IMMUTABLE/);
  assert.match(sql, /idx_influencer_posts_normalized_url/);
  assert.doesNotMatch(sql, /CURRENT_DATE/);
});

test("112: 정규화 규칙이 TS 와 동기 유지 주석으로 묶여 있다", () => {
  const sql = read(MIG_112);
  const ts = read("src/lib/influencer/url.ts");
  assert.match(sql, /url\.ts[\s\S]*?normalizePostUrl/, "SQL 에 TS 동기 유지 주석이 없습니다");
  assert.match(ts, /112[\s\S]*?normalize_post_url/, "TS 에 SQL 동기 유지 주석이 없습니다");
  assert.match(ts, /export function normalizePostUrl/);
});

test("112: 성과 갱신은 매칭 실패 시 기존 값을 지우지 않는다", () => {
  const sql = read(MIG_112);
  assert.match(sql, /FUNCTION public\.refresh_campaign_result\(p_campaign_id uuid\)/);
  // 못 찾으면 UPDATE 없이 빠져나가야 한다
  assert.match(sql, /IF NOT FOUND THEN\s*RETURN;/);
});

test("112: KPI 는 단일 RPC 를 유지하고 성과 필드만 더한다", () => {
  const sql = read(MIG_112);
  assert.match(sql, /FUNCTION public\.get_influencer_kpi_cards\(\)/);
  // 기존 필드 유지 (화면 호환)
  for (const f of ["total_count", "active_campaign_count", "done_campaign_count", "total_seeding_cost"]) {
    assert.match(sql, new RegExp(`'${f}'`), `기존 KPI 필드 ${f} 가 사라졌습니다`);
  }
  for (const f of ["total_result_views", "total_result_likes", "cost_per_10k_views"]) {
    assert.match(sql, new RegExp(`'${f}'`), `새 KPI 필드 ${f} 없음`);
  }
  assert.match(sql, /FUNCTION public\.get_influencer_seeding_history\(p_influencer_id uuid\)/);
});

test("지급: 지출 생성과 캠페인 갱신이 한 트랜잭션(RPC)이다", () => {
  const src = read("src/lib/influencer/contact-actions.ts");
  assert.match(
    src,
    /rpc\("mark_campaign_paid"/,
    "지출만 생기고 캠페인이 안 바뀌는 부분 성공을 막으려면 단일 RPC 여야 합니다"
  );
  assert.doesNotMatch(
    src,
    /from\("expenses"\)\s*\.insert/,
    "지출을 액션에서 직접 insert 하면 부분 성공이 생깁니다"
  );
});

test("서류 액션: 민감 서류 경로 전부가 잠금을 확인한다", () => {
  const p = "src/lib/influencer/document-actions.ts";
  assert.ok(exists(p), `${p} 가 없습니다`);
  const src = read(p);
  assert.match(src, /from "@\/lib\/vault\/gate"/);
  const unlockCalls = (src.match(/await requireUnlock\(/g) ?? []).length;
  assert.ok(
    unlockCalls >= 3,
    `업로드·다운로드·삭제 3곳에서 requireUnlock 이 필요합니다 (현재 ${unlockCalls})`
  );
  // 공개 URL 금지 — 서명 URL 만 허용
  assert.doesNotMatch(src, /getPublicUrl/);
  assert.match(src, /createSignedUrl\(/);
});

test("서류 업로드: 공용 검증 유틸을 쓰고 경로 규칙을 지킨다", () => {
  const p = "src/lib/influencer/document-storage.ts";
  assert.ok(exists(p), `${p} 가 없습니다`);
  const src = read(p);
  assert.match(src, /validateFile/);
  // 경로 2번째 조각이 general/sensitive 여야 스토리지 정책이 동작한다
  assert.match(src, /sensitive[\s\S]*general|general[\s\S]*sensitive/);
  assert.match(src, /INFLUENCER_DOC_BUCKET|"influencer-documents"/);
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
