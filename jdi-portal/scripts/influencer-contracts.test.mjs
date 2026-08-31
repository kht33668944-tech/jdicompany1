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
// 저장 후처리(캠페인 동기화·지출 기록)는 전자서명 흐름과 공유하려고 linkSync.ts 로 분리됨
const linkSync = read("src/lib/influencer/contracts/linkSync.ts");
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
  for (const fn of [
    "getSettlement",
    "upsertSettlement",
    "getIdCardSignedUrl",
    "getSettlementsForExport",
    "getIdCardUrlsForExport",
  ]) {
    const start = actions.indexOf(`export async function ${fn}`);
    assert.ok(start >= 0, `${fn} 액션이 없습니다`);
    const nextExport = actions.indexOf("export async function", start + 1);
    const body = actions.slice(start, nextExport === -1 ? undefined : nextExport);
    assert.match(body, /requireVaultUnlock\(/, `${fn} 이 잠금 확인 없이 개인정보를 다룹니다`);
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
  assert.match(linkSync, /CONTRACTS_PATH = "\/dashboard\/influencer\/contracts"/);
  assert.match(linkSync, /revalidatePath\("\/dashboard\/influencer"\)/);
  assert.match(linkSync, /revalidatePath\("\/dashboard\/influencer\/schedule"\)/);
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
    assert.match(
      body,
      /finishContractSave\(|syncCampaign\(/,
      `${fn} 이 시딩 캠페인 동기화를 빠뜨렸습니다`,
    );
  }
  // 공통 후처리 헬퍼가 동기화 + 지출 기록을 모두 품고, 독립 작업은 병렬로 돈다
  const start = linkSync.indexOf("export async function finishContractSave");
  assert.ok(start >= 0, "finishContractSave 헬퍼가 없습니다");
  const body = linkSync.slice(start);
  assert.match(body, /syncCampaign\(/);
  assert.match(body, /recordSettlementExpense\(/);
  assert.match(body, /Promise\.all/);
});

test("연동: 취소/삭제 시 캠페인을 스케줄에서 내린다", () => {
  const start = linkSync.indexOf("export async function syncCampaign");
  assert.ok(start >= 0);
  const body = linkSync.slice(start, linkSync.indexOf("async function ensureExpenseCategory"));
  assert.match(body, /"canceled"[\s\S]*?\.delete\(\)/, "취소된 계약의 캠페인 제거 분기가 없습니다");
});

test("연동: 리스트 자동 등록 실패가 계약 저장을 막지 않는다(try/catch)", () => {
  const start = actions.indexOf("async function resolveInfluencerLink");
  assert.ok(start >= 0);
  const body = actions.slice(start, actions.indexOf("async function getSessionUser"));
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

test("알림 SQL의 임박 기준·단계 억제 규칙이 화면 상수와 일치한다", () => {
  // 임박 일수: constants.ts 의 URGENT_SOON_DAYS == SQL 의 `+ N`
  const constants = read("src/lib/influencer/contracts/constants.ts");
  const soonDays = Number(constants.match(/URGENT_SOON_DAYS = (\d+)/)?.[1]);
  assert.ok(Number.isFinite(soonDays), "URGENT_SOON_DAYS 를 찾지 못했습니다");
  assert.match(
    migration121,
    new RegExp(`::DATE \\+ ${soonDays};`),
    "SQL 임박 기준(v_soon)이 URGENT_SOON_DAYS 와 다릅니다",
  );

  // 단계 억제: SQL 의 IN-리스트 3개 == CONTRACT_STATUS_ORDER 에서 해당 단계 이전까지
  const orderMatch = labels.match(/CONTRACT_STATUS_ORDER[^=]*=\s*\[([\s\S]*?)\]/);
  const order = [...orderMatch[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const before = (stage) => order.slice(0, order.indexOf(stage));
  const inLists = [...migration121.matchAll(/contract_status IN \(([^)]+)\)/g)].map((m) =>
    [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]),
  );
  assert.equal(inLists.length, 3, "알림 SQL 의 상태 IN-리스트는 발송/초안/게시 3개여야 합니다");
  assert.deepEqual(inLists[0], before("product_shipped"), "발송 알림의 억제 단계가 화면과 다릅니다");
  assert.deepEqual(inLists[1], before("draft_received"), "초안 알림의 억제 단계가 화면과 다릅니다");
  assert.deepEqual(inLists[2], before("posted"), "게시 알림의 억제 단계가 화면과 다릅니다");
});

test("지출 자동 기록: 중복 방지 + 실패해도 상태 변경 유지(try/catch)", () => {
  const start = linkSync.indexOf("async function recordSettlementExpense");
  assert.ok(start >= 0, "recordSettlementExpense 가 없습니다");
  const body = linkSync.slice(start, linkSync.indexOf("/** 동기화 결과"));
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
      getRetentionEnd("2026-12-01"),   // 게시 유지 3개월 (2026-08-21 6개월에서 변경)
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
    "2027-03-01",
    "soon",
    "overdue",
    null,
  ]);
});

// ------------------------------------------------------------
// 5) 시딩 1건 = 계약 1건 (마이그 124)
//
// 이 묶음이 깨지면 예전 증상이 그대로 돌아온다:
//  · 계약을 저장할 때마다 같은 사람 시딩건이 하나 더 생김(이름까지 동일)
//  · 계약을 지워도 시딩건이 KPI·깔때기·스케줄에 유령으로 남음
//  · 같은 사람이 리스트 '후보' / 스케줄 '협의중' 처럼 화면마다 다른 상태로 보임
// ------------------------------------------------------------
const unifyMigration = read("supabase/migrations/124_influencer_seeding_contract_unify.sql");
const influencerActions = read("src/lib/influencer/actions.ts");
const statusMap = read("src/lib/influencer/contracts/statusMap.ts");
const listClient = read("src/components/dashboard/influencer/InfluencerPageClient.tsx");
const listTable = read("src/components/dashboard/influencer/InfluencerTable.tsx");
const funnel = read("src/components/dashboard/influencer/SeedingFunnel.tsx");
const schedulePage = read("src/app/dashboard/influencer/schedule/page.tsx");
const scheduleBoard = read("src/components/dashboard/influencer/SeedingCampaignBoard.tsx");
const contractsPage = read("src/app/dashboard/influencer/contracts/page.tsx");

test("마이그 124: 계약서 양식과 회사 도장은 지우지 않는다", () => {
  // 양식(influencer_contract_templates)이 지워지면 편집해 둔 계약서를 되살릴 수 없다
  assert.doesNotMatch(
    unifyMigration,
    /DELETE\s+FROM\s+public\.influencer_contract_templates/i,
    "계약서 양식을 지우면 안 됩니다",
  );
  // 회사 도장은 계약과 무관한 공용 자산이라 storage 정리에서 제외해야 한다
  assert.match(unifyMigration, /bucket_id\s*=\s*'influencer-contract-docs'/);
  assert.match(unifyMigration, /name NOT LIKE 'company\/%'/);
});

test("마이그 124: 계약 1건이 시딩건 1건만 갖도록 부분 유니크 인덱스", () => {
  assert.match(
    unifyMigration,
    /CREATE UNIQUE INDEX IF NOT EXISTS influencer_contracts_campaign_id_key[\s\S]*?\(campaign_id\)[\s\S]*?WHERE campaign_id IS NOT NULL/,
  );
});

test("연동: syncCampaign 이 새로 만들기 전에 기존 시딩건을 흡수한다", () => {
  assert.match(
    linkSync,
    /async function findAdoptableCampaign/,
    "기존 시딩건을 찾는 분기가 없으면 계약 저장마다 중복이 생깁니다",
  );
  const start = linkSync.indexOf("export async function syncCampaign");
  const body = linkSync.slice(start);
  assert.match(
    body,
    /row\.campaign_id \?\? \(await findAdoptableCampaign\(/,
    "campaign_id 가 없을 때 기존 시딩건을 먼저 찾아야 합니다",
  );
  // 흡수 대상은 "살아있는 다른 계약이 물고 있지 않은" 것이어야 한다
  const finder = linkSync.slice(
    linkSync.indexOf("async function findAdoptableCampaign"),
    linkSync.indexOf("async function resolveContactDatePatch"),
  );
  assert.match(finder, /from\("influencer_contracts"\)[\s\S]*?is_deleted", false/);
});

test("연동: 계약과 연결된 시딩건은 리스트에서 단독 삭제할 수 없다", () => {
  const start = influencerActions.indexOf("export async function deleteCampaign");
  assert.ok(start >= 0);
  const nextExport = influencerActions.indexOf("export async function", start + 1);
  const body = influencerActions.slice(start, nextExport === -1 ? undefined : nextExport);
  assert.match(body, /from\("influencer_contracts"\)[\s\S]*?eq\("campaign_id", id\)/);
  assert.match(body, /is_deleted", false/);
  assert.match(body, /throw new Error\(/, "연결된 계약이 있으면 막고 이유를 알려야 합니다");
});

test("연동: 「시딩 시작」이 계약을 함께 만든다", () => {
  const start = actions.indexOf("export async function startSeeding");
  assert.ok(start >= 0, "startSeeding 액션이 없습니다");
  const nextExport = actions.indexOf("export async function", start + 1);
  const body = actions.slice(start, nextExport === -1 ? undefined : nextExport);
  assert.match(body, /from\("influencer_contracts"\)[\s\S]*?\.insert\(/);
  assert.match(body, /finishContractSave\(/, "시딩건 연결 후처리를 지나야 합니다");
  // 이미 계약이 있으면 새로 만들지 않는다(중복 방지)
  assert.match(body, /created:\s*false/);
  // 리스트는 이 액션을 쓰고, 캠페인만 만드는 addCampaign 은 더 이상 부르지 않는다
  assert.match(listClient, /startSeeding\(influencerId\)/);
  assert.doesNotMatch(listTable, /\baddCampaign\b/);
});

test("연동: DM 단계에 들어가면 연락일이 채워져 「DM 추적」이 켜진다", () => {
  assert.match(linkSync, /async function resolveContactDatePatch/);
  const body = linkSync.slice(
    linkSync.indexOf("async function resolveContactDatePatch"),
    linkSync.indexOf("export async function syncCampaign"),
  );
  assert.match(body, /contract_status !== "dm_sent"/);
  assert.match(body, /contact_date: toDateString\(kstNow\(\)\)/);
});

test("상태 통일: 리스트·깔때기·스케줄이 계약 10단계를 쓴다", () => {
  // 캠페인 6단계 선택지를 화면 상태 UI 에 다시 끌어오면 안 된다
  for (const [name, src] of [
    ["InfluencerTable", listTable],
    ["SeedingFunnel", funnel],
    ["SeedingCampaignBoard", scheduleBoard],
  ]) {
    assert.doesNotMatch(
      src,
      /CAMPAIGN_STATUS_OPTIONS|CampaignStatusDropdown/,
      `${name} 이 캠페인 6단계로 되돌아갔습니다`,
    );
    assert.match(src, /CONTRACT_STATUS_(LABEL|OPTIONS|ORDER)/, `${name} 이 계약 10단계를 안 씁니다`);
  }
  // 필터 상태 이름도 계약 기준
  assert.match(listTable, /filters\.contractStatuses/);
  assert.match(funnel, /filters\.contractStatuses/);
  // 계약 없는 옛 시딩건도 10단계로 환산해 보여준다
  assert.match(statusMap, /export function campaignToContractStatus/);
});

test("연동: 시딩 스케줄 화면이 계약 요약을 함께 불러온다", () => {
  assert.match(
    schedulePage,
    /getContractSummariesForList\(\)/,
    "스케줄이 계약을 모르면 상태가 화면마다 달라집니다",
  );
  assert.match(scheduleBoard, /updateContractStatus\(/);
  assert.match(scheduleBoard, /ContractLink/, "스케줄에서 계약서로 가는 길이 있어야 합니다");
});

test("연동: 계약 탭이 '계약 없는 시딩'을 알려준다", () => {
  assert.match(queries, /export async function getUnlinkedSeedings/);
  assert.match(contractsPage, /getUnlinkedSeedings\(\)/);
  const client = read("src/components/dashboard/influencer/contracts/ContractsPageClient.tsx");
  assert.match(client, /unlinkedSeedings\.length > 0/);
  // 같은 사람 계약이 이미 있으면 폼이 경고한다
  const form = read("src/components/dashboard/influencer/contracts/ContractFormModal.tsx");
  assert.match(form, /const duplicate = useMemo\(/);
  assert.match(client, /existingContracts=\{contracts\}/);
});

test("statusMap 은 서버 전용 import 를 갖지 않는다(클라이언트 공용)", () => {
  // 리스트·스케줄 화면이 이 파일을 직접 import 하므로, 서버 전용 모듈이 섞이면 빌드가 깨진다.
  // (주석에 이름이 나오는 건 괜찮으니 import 문만 본다)
  const imports = statusMap.match(/^\s*import[\s\S]*?;$/gm)?.join("\n") ?? "";
  assert.doesNotMatch(imports, /next\/cache|@\/lib\/supabase\/server/);
});

// ------------------------------------------------------------
// 5) 금액 통일 — 리스트 「계약 금액」 = 계약 탭 「금액」
//    같은 금액이 계약(원본)과 시딩건(cost 사본) 두 곳에 있어서, 사본이 뒤처지면
//    화면마다 다른 숫자가 나왔다(2026-08-26 95건 중 21건). 규칙을 한 곳에 모으고
//    DB 트리거로 사본을 붙잡아 둔 상태를 고정한다.
// ------------------------------------------------------------
const payoutSrc = read("src/lib/influencer/contracts/payout.ts");
const amountMigration = read("supabase/migrations/125_influencer_amount_unify.sql");
const contractsTable = read("src/components/dashboard/influencer/contracts/ContractsTable.tsx");

test("금액 통일: 계약 금액 규칙(getContractAmount)이 한 곳에만 있다", () => {
  assert.match(payoutSrc, /export function getContractAmount/);
  // 지급액과 섞이면 안 된다 — 계약 금액은 2차 활용비·원본비를 더하지 않는다
  const body = payoutSrc.slice(payoutSrc.indexOf("export function getContractAmount"));
  assert.doesNotMatch(body, /secondary_usage_fee|raw_footage_fee/);

  // 규칙을 각자 다시 적으면(= 삼항식 복붙) 또 어긋난다
  for (const [name, src] of [
    ["ContractsTable", contractsTable],
    ["linkSync", linkSync],
    ["queries", queries],
  ]) {
    assert.match(src, /getContractAmount/, `${name} 이 공용 금액 규칙을 안 씁니다`);
    assert.doesNotMatch(
      src,
      /=== "paid"[\s\S]{0,80}?(ad_fee_total|agreed_value)/,
      `${name} 에 금액 규칙이 복사돼 있습니다 — getContractAmount 를 쓰세요`,
    );
  }
});

test("금액 통일: 리스트가 계약 금액을 직접 보여준다", () => {
  assert.match(queries, /amount: getContractAmount\(/, "리스트용 계약 요약에 금액이 없습니다");
  assert.match(listTable, /function amountOf\(/);
  // 계약이 있으면 계약 값이 기준, 없을 때만 시딩건 합계
  const body = listTable.slice(listTable.indexOf("function amountOf("));
  assert.match(body.slice(0, 400), /contractByInfluencer\.get\([\s\S]*?return contract\.amount/);
  assert.match(listTable, />계약 금액<\/th>/, "리스트 칸 이름이 계약 탭과 다릅니다");
});

test("금액 통일: 계약이 바뀌면 시딩건 금액이 DB에서 따라온다", () => {
  // 포털 밖(스크립트·SQL 직접 수정)에서 고쳐도 어긋나지 않게 하는 장치
  assert.match(amountMigration, /CREATE OR REPLACE FUNCTION public\.sync_campaign_cost_from_contract/);
  assert.match(
    amountMigration,
    /AFTER INSERT OR UPDATE OF[\s\S]*?ad_fee_total[\s\S]*?ON public\.influencer_contracts/,
  );
  // 소프트 삭제된 계약이 시딩건 금액을 0/NULL 로 덮으면 이력이 망가진다
  assert.match(amountMigration, /NEW\.campaign_id IS NULL OR NEW\.is_deleted/);
  // 같은 값이면 쓰지 않는다(역동기화와 맞물려 계속 갱신되는 것 방지)
  assert.match(amountMigration, /cost IS DISTINCT FROM v_amount/);
  // 기존에 어긋난 사본도 1회 보정한다
  assert.match(amountMigration, /UPDATE public\.influencer_campaigns cp[\s\S]*?SET cost =/);
});
