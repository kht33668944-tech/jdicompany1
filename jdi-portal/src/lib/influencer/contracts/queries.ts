// TMA 계약 서버 전용 읽기. 정산 정보 평문 조회는 여기에 두지 않는다(actions.ts 의 잠금 게이트 경유).

import { createClient } from "@/lib/supabase/server";
import { CONTRACTS_SEASON } from "./constants";
import type { InfluencerContract } from "./types";

/** 목록 화면에 내려보내는 컬럼 — 정산 개인정보(*_enc)는 절대 포함하지 않는다. */
const CONTRACT_COLUMNS =
  "id, influencer_id, campaign_id, expense_id, name, instagram_handle, collab_type, product, product_detail, retail_price, " +
  "agreed_value, ad_fee_total, ad_fee_vat_included, settlement_type, business_reg_no, " +
  "secondary_usage, secondary_usage_fee, secondary_usage_start, secondary_usage_end, " +
  "allow_jdi_sns, allow_meta_ads, allow_edit, partnership_ad_access, " +
  "raw_footage, raw_footage_fee, raw_footage_scope, raw_footage_due, " +
  "product_ship_date, draft_due_date, post_planned_date, post_actual_date, " +
  "required_files_status, contract_status, modusign_url, memo, created_at, updated_at";

/**
 * 시즌 계약 전체 조회. 시즌당 100명 규모라 페이지네이션 없이 전량 로드 후
 * 검색/필터는 클라이언트에서 처리한다(즉각 반응).
 */
export async function getContracts(): Promise<InfluencerContract[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("influencer_contracts")
    .select(CONTRACT_COLUMNS)
    .eq("season", CONTRACTS_SEASON)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  // 컬럼 문자열이 여러 줄 결합이라 supabase 타입 추론이 실패한다 → unknown 경유 캐스팅
  return (data ?? []) as unknown as InfluencerContract[];
}

/**
 * 정산 정보가 등록된 계약 id 목록 — 표의 "등록됨/미등록" 표시에만 쓴다.
 * 개인정보 컬럼은 조회하지 않는다.
 */
export async function getSettlementContractIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("influencer_contract_settlements")
    .select("contract_id");
  if (error) throw error;
  return (data ?? []).map((row) => row.contract_id as string);
}
