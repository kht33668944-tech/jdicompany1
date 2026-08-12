// TMA 계약 관리 회귀 검사
// 규칙이 코드 곳곳에 흩어져 있는 유형이라, 아래 불변조건을 정적으로 고정한다.
//  1) 마이그레이션: RLS + is_approved_user + 소프트 삭제(DELETE 정책 없음) + updated_at 트리거 + 비공개 버킷
//  2) 개인정보: 목록 쿼리에 암호문 컬럼이 섞이지 않고, 정산 액션은 전부 잠금 게이트를 지난다
//  3) 상태 10단계: 라벨/순서/배지 색이 전부 같은 개수로 정의된다
//  4) 게시 유지 종료일: 월말 클램핑 계산이 맞는다 (실행 검증)
// 실행: node --test scripts/influencer-contracts.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const migration = read("supabase/migrations/119_influencer_contracts.sql");
const queries = read("src/lib/influencer/contracts/queries.ts");
const actions = read("src/lib/influencer/contracts/actions.ts");
const labels = read("src/lib/influencer/contracts/labels.ts");

// ------------------------------------------------------------
// 1) 마이그레이션 불변조건
// ------------------------------------------------------------
test("마이그레이션: 두 테이블 모두 RLS 활성 + is_approved_user 정책", () => {
  assert.match(migration, /ALTER TABLE public\.influencer_contracts ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE public\.influencer_contract_settlements ENABLE ROW LEVEL SECURITY/);
  const policyCount = (migration.match(/public\.is_approved_user\(\)/g) ?? []).length;
  assert.ok(policyCount >= 8, `is_approved_user 사용이 ${policyCount}회뿐입니다(정책 누락 의심)`);
});

test("마이그레이션: 계약/정산 테이블에 DELETE 정책이 없다(소프트 삭제 전용)", () => {
  assert.doesNotMatch(
    migration,
    /ON public\.influencer_contracts\s+FOR DELETE/i,
    "influencer_contracts 에 DELETE 정책이 생기면 소프트 삭제 설계가 깨집니다",
  );
  assert.doesNotMatch(migration, /ON public\.influencer_contract_settlements\s+FOR DELETE/i);
});

test("마이그레이션: updated_at 자동 갱신 트리거(공용 set_updated_at 재사용)", () => {
  assert.match(migration, /influencer_contracts_set_updated_at[\s\S]*?EXECUTE FUNCTION public\.set_updated_at\(\)/);
  assert.match(migration, /influencer_contract_settlements_set_updated_at[\s\S]*?EXECUTE FUNCTION public\.set_updated_at\(\)/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.set_updated_at/,
    "공용 함수를 재정의하지 말고 025의 것을 재사용해야 합니다");
});

test("마이그레이션: KST 규칙 위반 없음 + 신분증 버킷은 비공개", () => {
  assert.doesNotMatch(migration, /CURRENT_DATE/, "SQL에서 CURRENT_DATE 금지(KST 변환 필요)");
  assert.match(migration, /'influencer-contract-docs',\s*'influencer-contract-docs',\s*FALSE/);
});

test("마이그레이션: 정산 개인정보는 암호문 컬럼(*_enc)으로만 정의된다", () => {
  for (const col of ["phone_enc", "address_enc", "bank_name_enc", "bank_account_enc", "account_holder_enc"]) {
    assert.match(migration, new RegExp(col), `${col} 컬럼이 없습니다`);
  }
  assert.doesNotMatch(migration, /^\s*phone text/m, "평문 phone 컬럼을 만들면 안 됩니다");
});

// ------------------------------------------------------------
// 2) 개인정보 노출/게이트
// ------------------------------------------------------------
test("목록 쿼리: 암호문 컬럼을 조회하지 않고, is_deleted 필터가 있다", () => {
  // 주석의 "*_enc" 언급은 허용하되, 실제 암호문 컬럼명이 select 에 등장하면 안 된다
  assert.doesNotMatch(
    queries,
    /phone_enc|address_enc|bank_name_enc|bank_account_enc|account_holder_enc/,
    "목록 경로에 암호문 컬럼이 섞이면 개인정보 분리 설계가 깨집니다",
  );
  assert.match(queries, /\.eq\("is_deleted", false\)/);
  assert.match(queries, /\.select\("contract_id"\)/, "정산 등록 여부는 contract_id 만 조회해야 합니다");
});

test("정산 액션: 열람/수정/파일 링크 발급/내보내기 전부 잠금 게이트를 지난다", () => {
  for (const fn of ["getSettlement", "upsertSettlement", "getIdCardSignedUrl", "getSettlementsForExport"]) {
    const start = actions.indexOf(`export async function ${fn}`);
    assert.ok(start >= 0, `${fn} 액션이 없습니다`);
    const nextExport = actions.indexOf("export async function", start + 1);
    const body = actions.slice(start, nextExport === -1 ? undefined : nextExport);
    assert.match(body, /requireUnlock\(/, `${fn} 이 requireUnlock 없이 개인정보를 다룹니다`);
  }
  assert.match(actions, /encryptSecret\(/);
  assert.match(actions, /decryptSecret\(/);
});

test("삭제 액션: 소프트 삭제(is_deleted)만 쓰고 .delete() 를 쓰지 않는다", () => {
  const start = actions.indexOf("export async function deleteContract");
  assert.ok(start >= 0);
  const nextExport = actions.indexOf("export async function", start + 1);
  const body = actions.slice(start, nextExport === -1 ? undefined : nextExport);
  assert.match(body, /is_deleted: true/);
  assert.doesNotMatch(body, /\.delete\(/);
});

test("액션: 화면 갱신이 계약/리스트/스케줄 세 경로를 함께 가리킨다", () => {
  assert.match(actions, /CONTRACTS_PATH = "\/dashboard\/influencer\/contracts"/);
  assert.match(actions, /revalidatePath\("\/dashboard\/influencer"\)/);
  assert.match(actions, /revalidatePath\("\/dashboard\/influencer\/schedule"\)/);
});

// ------------------------------------------------------------
// 리스트/시딩 스케줄 연동 (마이그 120)
// ------------------------------------------------------------
const migration120 = read("supabase/migrations/120_influencer_contracts_link.sql");

test("마이그 120: 연결 컬럼이 멱등으로 추가되고 SET NULL 로 끊긴다", () => {
  assert.match(migration120, /ADD COLUMN IF NOT EXISTS influencer_id[\s\S]*?ON DELETE SET NULL/);
  assert.match(migration120, /ADD COLUMN IF NOT EXISTS campaign_id[\s\S]*?ON DELETE SET NULL/);
});

test("연동: 생성/수정/상태변경/삭제가 전부 시딩 캠페인을 동기화한다", () => {
  for (const fn of ["createContract", "updateContract", "updateContractStatus", "deleteContract"]) {
    const start = actions.indexOf(`export async function ${fn}`);
    assert.ok(start >= 0, `${fn} 액션이 없습니다`);
    const nextExport = actions.indexOf("export async function", start + 1);
    const body = actions.slice(start, nextExport === -1 ? undefined : nextExport);
    assert.match(body, /syncCampaign\(/, `${fn} 이 시딩 캠페인 동기화를 빠뜨렸습니다`);
  }
});

test("연동: 취소/삭제 시 캠페인을 스케줄에서 내린다", () => {
  const start = actions.indexOf("async function syncCampaign");
  assert.ok(start >= 0);
  const body = actions.slice(start, actions.indexOf("export async function", start));
  assert.match(body, /"canceled"[\s\S]*?\.delete\(\)/, "취소된 계약의 캠페인 제거 분기가 없습니다");
});

test("연동: 리스트 자동 등록 실패가 계약 저장을 막지 않는다(try/catch)", () => {
  const start = actions.indexOf("async function resolveInfluencerLink");
  assert.ok(start >= 0);
  const body = actions.slice(start, actions.indexOf("async function syncCampaign"));
  assert.match(body, /addInfluencer\(/);
  assert.match(body, /catch/, "addInfluencer 실패를 잡아 계약 저장을 계속해야 합니다");
});

// ------------------------------------------------------------
// 운영 편의 (마이그 121): 지출 자동 기록 + 아침 알림 + 정산 자료
// ------------------------------------------------------------
const migration121 = read("supabase/migrations/121_influencer_contracts_ops.sql");
const pushDispatch = read("supabase/functions/push-dispatch/index.ts");

test("마이그 121: expense_id 멱등 추가 + 알림 함수/크론 등록", () => {
  assert.match(migration121, /ADD COLUMN IF NOT EXISTS expense_id[\s\S]*?ON DELETE SET NULL/);
  assert.match(migration121, /remind_influencer_contracts/);
  assert.match(migration121, /is_approved = TRUE/);
  assert.match(migration121, /REVOKE ALL ON FUNCTION public\.remind_influencer_contracts/);
  assert.match(migration121, /cron\.schedule\(\s*'influencer_contract_reminder'/);
  assert.doesNotMatch(migration121, /CURRENT_DATE/);
});

test("알림 타입이 push-dispatch 에 등록되어 있다", () => {
  assert.match(pushDispatch, /influencer_contract_reminder/, "타입 미등록이면 푸시가 나가지 않습니다");
});

test("지출 자동 기록: 중복 방지 + 실패해도 상태 변경 유지(try/catch)", () => {
  const start = actions.indexOf("async function recordSettlementExpense");
  assert.ok(start >= 0, "recordSettlementExpense 가 없습니다");
  const body = actions.slice(start, actions.indexOf("/** 동기화 결과"));
  assert.match(body, /row\.expense_id\) return 0/, "expense_id 중복 방지 조건이 없습니다");
  assert.match(body, /catch/, "지출 기록 실패가 상태 변경을 되돌리면 안 됩니다");
  assert.match(body, /getContractPayout\(/);
});

test("payout: 지급액·원천징수 3.3% 계산이 맞는다", () => {
  const payoutUrl = pathToFileURL(path.join(root, "src/lib/influencer/contracts/payout.ts")).href;
  const script = `
    import { getContractPayout, getWithholding } from ${JSON.stringify(payoutUrl)};
    const paid = { collab_type: "paid", ad_fee_total: 1500000, secondary_usage: "paid",
      secondary_usage_fee: 300000, raw_footage: "not_provided", raw_footage_fee: null };
    const seeding = { collab_type: "seeding", ad_fee_total: 999999, secondary_usage: "free",
      secondary_usage_fee: null, raw_footage: "paid", raw_footage_fee: 200000 };
    console.log(JSON.stringify([
      getContractPayout(paid),                 // 1,500,000 + 300,000
      getContractPayout(seeding),              // 협찬형은 광고비 제외 → 200,000
      getWithholding(1800000, "individual"),   // 3.3% = 59,400
      getWithholding(1800000, "business"),     // 사업자는 0
      getWithholding(0, "individual"),
    ]));
  `;
  const out = execFileSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
    { encoding: "utf8" },
  ).trim();
  assert.deepEqual(JSON.parse(out), [1800000, 200000, 59400, 0, 0]);
});

// ------------------------------------------------------------
// 3) 상태 10단계 일관성
// ------------------------------------------------------------
test("labels: 상태 10단계가 라벨/순서/배지/점 색에 전부 정의된다", () => {
  const orderMatch = labels.match(/CONTRACT_STATUS_ORDER[^=]*=\s*\[([\s\S]*?)\]/);
  assert.ok(orderMatch, "CONTRACT_STATUS_ORDER 가 없습니다");
  const statuses = [...orderMatch[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert.equal(statuses.length, 10, `상태가 10개가 아니라 ${statuses.length}개입니다`);
  for (const s of statuses) {
    for (const table of ["CONTRACT_STATUS_LABEL", "CONTRACT_STATUS_BADGE_CLASSES", "CONTRACT_STATUS_DOT_CLASSES"]) {
      const section = labels.slice(labels.indexOf(table));
      assert.match(section.slice(0, section.indexOf("};")), new RegExp(`${s}:`), `${table} 에 ${s} 가 없습니다`);
    }
  }
});

// ------------------------------------------------------------
// 4) 게시 유지 종료일 계산 (실행 검증 — TS 를 strip-types 로 직접 실행)
// ------------------------------------------------------------
test("dates: addMonthsClamped 월말 클램핑이 맞는다", () => {
  const datesUrl = pathToFileURL(path.join(root, "src/lib/influencer/contracts/dates.ts")).href;
  const script = `
    import { addMonthsClamped, getRetentionEnd, getDateUrgency } from ${JSON.stringify(datesUrl)};
    const results = [
      addMonthsClamped("2025-08-31", 6),   // 2월엔 31일이 없다 → 말일
      addMonthsClamped("2026-12-15", 6),   // 연도 넘어감
      getRetentionEnd("2026-12-01"),
      getDateUrgency("2026-08-13", "2026-08-12", 3),
      getDateUrgency("2026-08-10", "2026-08-12", 3),
      getDateUrgency("2026-09-30", "2026-08-12", 3),
    ];
    console.log(JSON.stringify(results));
  `;
  const out = execFileSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
    { encoding: "utf8" },
  ).trim();
  assert.deepEqual(JSON.parse(out), [
    "2026-02-28",
    "2027-06-15",
    "2027-06-01",
    "soon",
    "overdue",
    null,
  ]);
});
