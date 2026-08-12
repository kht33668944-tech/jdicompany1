"use server";

// TMA 계약 서버 액션.
// - 오류는 { error } 반환이 아니라 throw new Error("한국어 문구") (호출부 getErrorMessage 관례)
// - 정산 정보(개인정보)는 보관함(106)과 같은 2차 비밀번호 잠금 쿠키를 확인한 뒤에만
//   복호화해 반환한다. DB에는 암호문만 저장된다.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret, verifyUnlockToken } from "@/lib/vault/crypto";
import { VAULT_UNLOCK_COOKIE } from "@/lib/vault/constants";
import { CONTRACT_DOCS_BUCKET, CONTRACTS_SEASON } from "./constants";
import { CONTRACT_STATUS_ORDER } from "./labels";
import type { ContractInput, ContractSettlement, ContractStatus, SettlementInput } from "./types";

const CONTRACTS_PATH = "/dashboard/influencer/contracts";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: session.user.id };
}

/** 정산 정보 열람/수정 전 2차 비밀번호 잠금 확인(보관함과 같은 잠금을 공유). */
async function requireUnlock(userId: string) {
  const store = await cookies();
  const token = store.get(VAULT_UNLOCK_COOKIE)?.value;
  if (!verifyUnlockToken(token, userId)) {
    throw new Error("잠금이 필요합니다. 2차 비밀번호를 입력해주세요.");
  }
}

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

  if (!includes(["paid", "seeding"] as const, input.collab_type))
    throw new Error("협업 유형 값이 잘못되었습니다.");
  if (!includes(["tree_150", "tree_180"] as const, input.product))
    throw new Error("제공 제품 값이 잘못되었습니다.");
  if (input.settlement_type !== null && !includes(["business", "individual"] as const, input.settlement_type))
    throw new Error("정산 구분 값이 잘못되었습니다.");
  if (!includes(["free", "paid", "not_allowed"] as const, input.secondary_usage))
    throw new Error("2차 활용 값이 잘못되었습니다.");
  if (!includes(["free", "paid", "not_provided"] as const, input.raw_footage))
    throw new Error("촬영 원본 값이 잘못되었습니다.");
  if (!includes(["none", "partial", "complete"] as const, input.required_files_status))
    throw new Error("필수 파일 상태 값이 잘못되었습니다.");
  if (!includes(CONTRACT_STATUS_ORDER, input.contract_status))
    throw new Error("계약 상태 값이 잘못되었습니다.");

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
    instagram_handle: input.instagram_handle.trim().replace(/^@/, ""),
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
export async function createContract(input: ContractInput): Promise<string> {
  const { supabase, userId } = await getSessionUser();
  const valid = validateContractInput(input);
  const { data, error } = await supabase
    .from("influencer_contracts")
    .insert({ ...valid, season: CONTRACTS_SEASON, created_by: userId })
    .select("id")
    .single();
  if (error) throw new Error(`계약 추가에 실패했습니다: ${error.message}`);
  revalidatePath(CONTRACTS_PATH);
  return data.id as string;
}

export async function updateContract(id: string, input: ContractInput): Promise<void> {
  const { supabase } = await getSessionUser();
  const valid = validateContractInput(input);
  const { error } = await supabase
    .from("influencer_contracts")
    .update(valid)
    .eq("id", id)
    .eq("is_deleted", false);
  if (error) throw new Error(`계약 수정에 실패했습니다: ${error.message}`);
  revalidatePath(CONTRACTS_PATH);
}

/** 표에서 배지 클릭으로 상태만 바꾸는 경량 액션 */
export async function updateContractStatus(id: string, status: ContractStatus): Promise<void> {
  const { supabase } = await getSessionUser();
  if (!includes(CONTRACT_STATUS_ORDER, status)) throw new Error("계약 상태 값이 잘못되었습니다.");
  const { error } = await supabase
    .from("influencer_contracts")
    .update({ contract_status: status })
    .eq("id", id)
    .eq("is_deleted", false);
  if (error) throw new Error(`상태 변경에 실패했습니다: ${error.message}`);
  revalidatePath(CONTRACTS_PATH);
}

/** 소프트 삭제 — DB에 DELETE 정책이 없어 실수로도 완전 삭제되지 않는다. */
export async function deleteContract(id: string): Promise<void> {
  const { supabase } = await getSessionUser();
  const { error } = await supabase
    .from("influencer_contracts")
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) throw new Error(`계약 삭제에 실패했습니다: ${error.message}`);
  revalidatePath(CONTRACTS_PATH);
}

// ============================================================
// 정산 정보 (2차 비밀번호 잠금 뒤에서만 평문 취급)
// ============================================================
export async function getSettlement(contractId: string): Promise<ContractSettlement | null> {
  const { supabase, userId } = await getSessionUser();
  await requireUnlock(userId);

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
  await requireUnlock(userId);

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

/** 신분증 파일 열람용 임시 링크(60초). 잠금 해제 상태에서만 발급. */
export async function getIdCardSignedUrl(contractId: string): Promise<string | null> {
  const { supabase, userId } = await getSessionUser();
  await requireUnlock(userId);

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
