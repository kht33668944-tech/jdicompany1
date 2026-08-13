"use server";

// TMA 계약 서버 액션.
// - 오류는 { error } 반환이 아니라 throw new Error("한국어 문구") (호출부 getErrorMessage 관례)
// - 정산 정보(개인정보)는 보관함(106)과 같은 2차 비밀번호 잠금 쿠키를 확인한 뒤에만
//   복호화해 반환한다. DB에는 암호문만 저장된다.

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret } from "@/lib/vault/crypto";
import { requireVaultUnlock } from "@/lib/vault/unlock";
import { addInfluencer } from "@/lib/influencer/actions";
import {
  CONTRACT_DOCS_BUCKET,
  CONTRACTS_SEASON,
  UUID_RE,
} from "./constants";
import {
  COLLAB_TYPE_ORDER,
  CONTRACT_STATUS_ORDER,
  PRODUCT_ORDER,
  RAW_FOOTAGE_ORDER,
  REQUIRED_FILES_ORDER,
  SECONDARY_USAGE_ORDER,
  SETTLEMENT_TYPE_ORDER,
} from "./labels";
import {
  CONTRACTS_PATH,
  finishContractSave,
  LINK_COLUMNS,
  revalidateLinkedPaths,
  saveCampaignId,
  syncCampaign,
  type ContractLinkRow,
} from "./linkSync";
import type {
  ContractInput,
  ContractSaveResult,
  ContractSettlement,
  ContractStatus,
  SettlementExportRow,
  SettlementInput,
} from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HANDLE_RE = /^[a-zA-Z0-9._]{1,30}$/;

/** 인스타 계정 정규화 — 공백/@ 제거 (검증·연동이 같은 형태를 쓴다) */
function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, "");
}

/**
 * 인플루언서 리스트 연결 확정.
 * 자동완성으로 고른 id 가 있으면 그대로, 없으면 인스타 계정으로 기존 리스트를 찾고,
 * 그래도 없으면 리스트에 자동 등록한다(분석 포함 — 실패해도 계약 저장은 막지 않는다).
 */
async function resolveInfluencerLink(
  supabase: SupabaseClient,
  instagramHandle: string,
  pickedId: string | null,
): Promise<{ influencerId: string | null; addedToList: boolean }> {
  if (pickedId) return { influencerId: pickedId, addedToList: false };
  const handle = normalizeHandle(instagramHandle);
  if (!handle || !HANDLE_RE.test(handle)) return { influencerId: null, addedToList: false };

  try {
    // addInfluencer 가 기존 등록 여부를 스스로 확인한다(있으면 Apify 호출 없이 기존 id 반환).
    const added = await addInfluencer(`https://www.instagram.com/${handle}/`);
    return { influencerId: added.influencer_id, addedToList: !added.alreadyExisted };
  } catch (error) {
    // 수집 실패(비공개 계정, 오타 등)여도 계약 저장은 계속한다 — 연동만 빠진다.
    console.error("[contracts] 리스트 자동 등록 실패:", error);
    return { influencerId: null, addedToList: false };
  }
}

// 캠페인 동기화·지출 자동 기록 등 저장 후처리는 linkSync.ts 로 분리
// (전자서명 완료 흐름 /api/sign 이 같은 후처리를 공유한다).

async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: session.user.id };
}

// 정산 정보 열람/수정 전 2차 비밀번호 잠금 확인 — 보관함과 같은 구현(vault/unlock.ts)을 공유한다.

// ============================================================
// 입력 검증
// ============================================================
function requireDateOrNull(value: string | null, label: string): string | null {
  if (value === null || value === "") return null;
  if (!DATE_RE.test(value)) throw new Error(`${label} 날짜 형식이 잘못되었습니다.`);
  return value;
}

function requireMoneyOrNull(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label}은(는) 0 이상의 정수(원)여야 합니다.`);
  }
  return value;
}

function includes<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

/** 폼 입력 검증 + 정규화. 실패 시 한국어 메시지로 throw. */
function validateContractInput(input: ContractInput): ContractInput {
  const name = input.name.trim();
  if (!name) throw new Error("이름/채널명을 입력해주세요.");

  // 열거값 검증은 labels.ts 의 *_ORDER 단일 소스를 그대로 쓴다(옵션 추가 시 자동 반영)
  if (!includes(COLLAB_TYPE_ORDER, input.collab_type))
    throw new Error("협업 유형 값이 잘못되었습니다.");
  if (!includes(PRODUCT_ORDER, input.product))
    throw new Error("제공 제품 값이 잘못되었습니다.");
  if (input.settlement_type !== null && !includes(SETTLEMENT_TYPE_ORDER, input.settlement_type))
    throw new Error("정산 구분 값이 잘못되었습니다.");
  if (!includes(SECONDARY_USAGE_ORDER, input.secondary_usage))
    throw new Error("2차 활용 값이 잘못되었습니다.");
  if (!includes(RAW_FOOTAGE_ORDER, input.raw_footage))
    throw new Error("촬영 원본 값이 잘못되었습니다.");
  if (!includes(REQUIRED_FILES_ORDER, input.required_files_status))
    throw new Error("필수 파일 상태 값이 잘못되었습니다.");
  if (!includes(CONTRACT_STATUS_ORDER, input.contract_status))
    throw new Error("계약 상태 값이 잘못되었습니다.");

  if (input.influencer_id !== null && !UUID_RE.test(input.influencer_id)) {
    throw new Error("리스트 연결 정보가 잘못되었습니다.");
  }

  const modusign_url = input.modusign_url?.trim() || null;
  if (modusign_url) {
    let parsed: URL;
    try {
      parsed = new URL(modusign_url);
    } catch {
      throw new Error("모두싸인 링크 주소가 올바르지 않습니다.");
    }
    if (parsed.protocol !== "https:") throw new Error("모두싸인 링크는 https 주소여야 합니다.");
  }

  return {
    ...input,
    name,
    instagram_handle: normalizeHandle(input.instagram_handle),
    product_detail: input.product_detail?.trim() || null,
    business_reg_no: input.business_reg_no?.trim() || null,
    raw_footage_scope: input.raw_footage_scope?.trim() || null,
    memo: input.memo?.trim() || null,
    modusign_url,
    retail_price: requireMoneyOrNull(input.retail_price, "소비자가"),
    agreed_value: requireMoneyOrNull(input.agreed_value, "약정가액"),
    ad_fee_total: requireMoneyOrNull(input.ad_fee_total, "광고비 총액"),
    secondary_usage_fee: requireMoneyOrNull(input.secondary_usage_fee, "2차 활용 추가비용"),
    raw_footage_fee: requireMoneyOrNull(input.raw_footage_fee, "촬영 원본 추가비용"),
    secondary_usage_start: requireDateOrNull(input.secondary_usage_start, "2차 활용 시작일"),
    secondary_usage_end: requireDateOrNull(input.secondary_usage_end, "2차 활용 종료일"),
    raw_footage_due: requireDateOrNull(input.raw_footage_due, "원본 전달일"),
    product_ship_date: requireDateOrNull(input.product_ship_date, "제품 발송일"),
    draft_due_date: requireDateOrNull(input.draft_due_date, "초안 전달일"),
    post_planned_date: requireDateOrNull(input.post_planned_date, "게시 예정일"),
    post_actual_date: requireDateOrNull(input.post_actual_date, "실제 게시일"),
  };
}

// ============================================================
// 계약 CRUD
// ============================================================
export async function createContract(input: ContractInput): Promise<ContractSaveResult> {
  const { supabase, userId } = await getSessionUser();
  const valid = validateContractInput(input);

  // 리스트 연결(없으면 자동 등록) → 계약 저장 → 시딩 캠페인 생성
  const link = await resolveInfluencerLink(supabase, valid.instagram_handle, valid.influencer_id);
  const { data, error } = await supabase
    .from("influencer_contracts")
    .insert({ ...valid, influencer_id: link.influencerId, season: CONTRACTS_SEASON, created_by: userId })
    .select(LINK_COLUMNS)
    .single();
  if (error) throw new Error(`계약 추가에 실패했습니다: ${error.message}`);

  const row = data as unknown as ContractLinkRow;
  const finish = await finishContractSave(supabase, userId, row);
  return { id: row.id, addedToList: link.addedToList, ...finish };
}

export async function updateContract(id: string, input: ContractInput): Promise<ContractSaveResult> {
  const { supabase, userId } = await getSessionUser();
  const valid = validateContractInput(input);

  const { data: current, error: findErr } = await supabase
    .from("influencer_contracts")
    .select("influencer_id, campaign_id")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (findErr) throw new Error(`계약 확인에 실패했습니다: ${findErr.message}`);
  if (!current) throw new Error("계약을 찾을 수 없습니다.");

  // 이미 연결돼 있으면 유지, 없으면 이번 입력으로 연결 시도
  const link = await resolveInfluencerLink(
    supabase,
    valid.instagram_handle,
    valid.influencer_id ?? (current.influencer_id as string | null),
  );
  const { data, error } = await supabase
    .from("influencer_contracts")
    .update({ ...valid, influencer_id: link.influencerId })
    .eq("id", id)
    .eq("is_deleted", false)
    .select(LINK_COLUMNS)
    .single();
  if (error) throw new Error(`계약 수정에 실패했습니다: ${error.message}`);

  const row = data as unknown as ContractLinkRow;
  const finish = await finishContractSave(supabase, userId, row);
  return { id: row.id, addedToList: link.addedToList, ...finish };
}

/**
 * 표에서 배지 클릭으로 상태만 바꾸는 경량 액션 — 시딩 캠페인 상태도 따라가고,
 * '정산 완료'로 바뀌면 지출을 자동 기록한다(기록 금액 반환, 없으면 0).
 */
export async function updateContractStatus(
  id: string,
  status: ContractStatus,
): Promise<{ expenseAmount: number }> {
  const { supabase, userId } = await getSessionUser();
  if (!includes(CONTRACT_STATUS_ORDER, status)) throw new Error("계약 상태 값이 잘못되었습니다.");
  const { data, error } = await supabase
    .from("influencer_contracts")
    .update({ contract_status: status })
    .eq("id", id)
    .eq("is_deleted", false)
    .select(LINK_COLUMNS)
    .single();
  if (error) throw new Error(`상태 변경에 실패했습니다: ${error.message}`);

  const row = data as unknown as ContractLinkRow;
  const { expenseAmount } = await finishContractSave(supabase, userId, row);
  return { expenseAmount };
}

/** 소프트 삭제 — DB에 DELETE 정책이 없어 실수로도 완전 삭제되지 않는다. 연동된 캠페인은 스케줄에서 제거. */
export async function deleteContract(id: string): Promise<void> {
  const { supabase, userId } = await getSessionUser();
  const { data, error } = await supabase
    .from("influencer_contracts")
    .update({ is_deleted: true })
    .eq("id", id)
    .select(LINK_COLUMNS)
    .single();
  if (error) throw new Error(`계약 삭제에 실패했습니다: ${error.message}`);

  const row = data as unknown as ContractLinkRow;
  if (row.campaign_id) {
    // 계약이 사라지면 스케줄에서도 내린다 (취소와 동일 처리)
    const campaignId = await syncCampaign(supabase, userId, { ...row, contract_status: "canceled" });
    await saveCampaignId(supabase, row.id, row.campaign_id, campaignId);
  }
  revalidateLinkedPaths();
}

// ============================================================
// 정산 정보 (2차 비밀번호 잠금 뒤에서만 평문 취급)
// ============================================================
export async function getSettlement(contractId: string): Promise<ContractSettlement | null> {
  const { supabase, userId } = await getSessionUser();
  await requireVaultUnlock(userId);

  const { data, error } = await supabase
    .from("influencer_contract_settlements")
    .select("contract_id, phone_enc, address_enc, bank_name_enc, bank_account_enc, account_holder_enc, id_card_path, id_card_name")
    .eq("contract_id", contractId)
    .maybeSingle();
  if (error) throw new Error(`정산 정보를 불러오지 못했습니다: ${error.message}`);
  if (!data) return null;

  return {
    contract_id: data.contract_id as string,
    phone: decryptSecret(data.phone_enc),
    address: decryptSecret(data.address_enc),
    bank_name: decryptSecret(data.bank_name_enc),
    bank_account: decryptSecret(data.bank_account_enc),
    account_holder: decryptSecret(data.account_holder_enc),
    id_card_path: (data.id_card_path as string | null) ?? null,
    id_card_name: (data.id_card_name as string | null) ?? null,
  };
}

export async function upsertSettlement(contractId: string, input: SettlementInput): Promise<void> {
  const { supabase, userId } = await getSessionUser();
  await requireVaultUnlock(userId);

  const phone = input.phone.trim();
  if (phone && !/^[\d\s+-]{7,20}$/.test(phone)) {
    throw new Error("휴대폰 번호는 숫자와 - 만 입력해주세요.");
  }
  const bankAccount = input.bank_account.trim();
  if (bankAccount && !/^[\d-]{5,30}$/.test(bankAccount)) {
    throw new Error("계좌번호는 숫자와 - 만 입력해주세요.");
  }

  const encrypted = {
    phone_enc: encryptSecret(phone),
    address_enc: encryptSecret(input.address.trim()),
    bank_name_enc: encryptSecret(input.bank_name.trim()),
    bank_account_enc: encryptSecret(bankAccount),
    account_holder_enc: encryptSecret(input.account_holder.trim()),
    id_card_path: input.id_card_path,
    id_card_name: input.id_card_name?.trim() || null,
  };

  const { data: existing, error: findErr } = await supabase
    .from("influencer_contract_settlements")
    .select("id, id_card_path")
    .eq("contract_id", contractId)
    .maybeSingle();
  if (findErr) throw new Error(`정산 정보 확인에 실패했습니다: ${findErr.message}`);

  if (existing) {
    const { error } = await supabase
      .from("influencer_contract_settlements")
      .update({ ...encrypted, updated_by: userId })
      .eq("id", existing.id);
    if (error) throw new Error(`정산 정보 수정에 실패했습니다: ${error.message}`);
    // 신분증 파일을 새로 올려 갈아끼웠으면 옛 파일은 정리(실패해도 무시)
    const oldPath = existing.id_card_path as string | null;
    if (oldPath && oldPath !== input.id_card_path) {
      await supabase.storage.from(CONTRACT_DOCS_BUCKET).remove([oldPath]).catch(() => {});
    }
  } else {
    const { error } = await supabase
      .from("influencer_contract_settlements")
      .insert({ contract_id: contractId, ...encrypted, created_by: userId, updated_by: userId });
    if (error) throw new Error(`정산 정보 저장에 실패했습니다: ${error.message}`);
  }
  revalidatePath(CONTRACTS_PATH);
}

/** 내보내기 선택 검증 — 잠금 확인 뒤에만 쓴다 */
function validateExportIds(contractIds: string[]): void {
  if (contractIds.length > 200) throw new Error("한 번에 200명까지만 내보낼 수 있습니다.");
  if (!contractIds.every((id) => UUID_RE.test(id))) throw new Error("선택 정보가 잘못되었습니다.");
}

/**
 * 정산 자료 내보내기용 일괄 조회 — 잠금 해제 상태에서만 복호화해 반환.
 * 신분증 임시 링크는 만료가 짧아 여기서 미리 발급하지 않는다
 * (미리보기 표는 id_card_path 유무만 쓰고, 링크는 다운로드 시점에 getIdCardUrlsForExport 로).
 */
export async function getSettlementsForExport(
  contractIds: string[],
): Promise<SettlementExportRow[]> {
  const { supabase, userId } = await getSessionUser();
  await requireVaultUnlock(userId);
  if (!Array.isArray(contractIds) || contractIds.length === 0) return [];
  validateExportIds(contractIds);

  const { data, error } = await supabase
    .from("influencer_contract_settlements")
    .select("contract_id, phone_enc, address_enc, bank_name_enc, bank_account_enc, account_holder_enc, id_card_path, id_card_name")
    .in("contract_id", contractIds);
  if (error) throw new Error(`정산 정보를 불러오지 못했습니다: ${error.message}`);

  return (data ?? []).map((r) => ({
    contract_id: r.contract_id as string,
    phone: decryptSecret(r.phone_enc),
    address: decryptSecret(r.address_enc),
    bank_name: decryptSecret(r.bank_name_enc),
    bank_account: decryptSecret(r.bank_account_enc),
    account_holder: decryptSecret(r.account_holder_enc),
    id_card_path: (r.id_card_path as string | null) ?? null,
    id_card_name: (r.id_card_name as string | null) ?? null,
  }));
}

/**
 * 신분증 임시 링크(2분) 일괄 발급 — ZIP 다운로드 버튼을 누른 시점에만 부른다.
 * 미리보기 단계에서 발급하면 표를 보는 동안 만료돼 다운로드가 조용히 빠질 수 있다.
 */
export async function getIdCardUrlsForExport(
  contractIds: string[],
): Promise<{ contract_id: string; url: string }[]> {
  const { supabase, userId } = await getSessionUser();
  await requireVaultUnlock(userId);
  if (!Array.isArray(contractIds) || contractIds.length === 0) return [];
  validateExportIds(contractIds);

  const { data, error } = await supabase
    .from("influencer_contract_settlements")
    .select("contract_id, id_card_path")
    .in("contract_id", contractIds)
    .not("id_card_path", "is", null);
  if (error) throw new Error(`신분증 파일을 확인하지 못했습니다: ${error.message}`);

  const rows = (data ?? []) as { contract_id: string; id_card_path: string }[];
  if (rows.length === 0) return [];

  const { data: signed, error: signErr } = await supabase.storage
    .from(CONTRACT_DOCS_BUCKET)
    .createSignedUrls(rows.map((r) => r.id_card_path), 120);
  if (signErr) throw new Error(`신분증 파일 주소를 만들지 못했습니다: ${signErr.message}`);

  const urlByPath = new Map<string, string>();
  for (const s of signed ?? []) {
    if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }
  return rows
    .map((r) => ({ contract_id: r.contract_id, url: urlByPath.get(r.id_card_path) ?? "" }))
    .filter((r) => r.url);
}

/** 신분증 파일 열람용 임시 링크(60초). 잠금 해제 상태에서만 발급. */
export async function getIdCardSignedUrl(contractId: string): Promise<string | null> {
  const { supabase, userId } = await getSessionUser();
  await requireVaultUnlock(userId);

  const { data, error } = await supabase
    .from("influencer_contract_settlements")
    .select("id_card_path")
    .eq("contract_id", contractId)
    .maybeSingle();
  if (error) throw new Error(`신분증 파일을 확인하지 못했습니다: ${error.message}`);
  const path = data?.id_card_path as string | null;
  if (!path) return null;

  const { data: signed, error: signErr } = await supabase.storage
    .from(CONTRACT_DOCS_BUCKET)
    .createSignedUrl(path, 60);
  if (signErr) throw new Error(`파일 주소를 만들지 못했습니다: ${signErr.message}`);
  return signed?.signedUrl ?? null;
}
