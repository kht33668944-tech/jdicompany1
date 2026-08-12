// 계약 저장 후처리(리스트·시딩 스케줄·지출 연동) — actions.ts 에서 분리한 서버 전용 모듈.
//
// 분리 이유: 전자서명 완료(/api/sign, 로그인 없음 → service role 클라이언트)도
// 같은 후처리를 써야 하는데, "use server" 파일은 서버 액션만 export 할 수 있어
// 내부 헬퍼를 공유할 수 없다. 클라이언트는 인자로 받으므로 인증 경로와 무관하다.

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignStatus } from "@/lib/influencer/types";
import { kstNow, toDateString } from "@/lib/utils/date";
import {
  EXPENSE_CATEGORY_NAME,
  EXPENSE_PAYMENT_METHOD,
  TMA_CAMPAIGN_NAME,
} from "./constants";
import { PRODUCT_LABEL } from "./labels";
import { getContractPayout } from "./payout";
import type { ContractStatus } from "./types";

export const CONTRACTS_PATH = "/dashboard/influencer/contracts";

/** 계약 상태 → 시딩 캠페인 상태 매핑 (취소는 캠페인 제거로 처리) */
export const CONTRACT_TO_CAMPAIGN_STATUS: Record<
  Exclude<ContractStatus, "canceled">,
  CampaignStatus
> = {
  candidate: "planned",
  dm_sent: "dm_sent",
  negotiating: "replied",
  contract_sent: "replied",
  signed: "replied",
  product_shipped: "shipped",
  draft_received: "shipped",
  posted: "posted",
  settled: "done",
};

/** 리스트/스케줄/지출 연동에 필요한 계약 행 최소 필드 */
export interface ContractLinkRow {
  id: string;
  influencer_id: string | null;
  campaign_id: string | null;
  expense_id: string | null;
  name: string;
  instagram_handle: string;
  collab_type: "paid" | "seeding";
  product: "tree_150" | "tree_180";
  agreed_value: number | null;
  ad_fee_total: number | null;
  secondary_usage: "free" | "paid" | "not_allowed";
  secondary_usage_fee: number | null;
  raw_footage: "free" | "paid" | "not_provided";
  raw_footage_fee: number | null;
  product_ship_date: string | null;
  post_planned_date: string | null;
  post_actual_date: string | null;
  contract_status: ContractStatus;
}

export const LINK_COLUMNS =
  "id, influencer_id, campaign_id, expense_id, name, instagram_handle, collab_type, product, " +
  "agreed_value, ad_fee_total, secondary_usage, secondary_usage_fee, raw_footage, raw_footage_fee, " +
  "product_ship_date, post_planned_date, post_actual_date, contract_status";

/** 연동 화면 3곳(계약/리스트/시딩 스케줄)을 함께 갱신 */
export function revalidateLinkedPaths() {
  revalidatePath(CONTRACTS_PATH);
  revalidatePath("/dashboard/influencer");
  revalidatePath("/dashboard/influencer/schedule");
}

/**
 * 계약 → 시딩 캠페인 단방향 동기화. 반환값은 최종 campaign_id(연동 없음/제거면 null).
 * 계약 저장 이후에 도는 후처리라, 실패해도 throw 하지 않고 연동만 빠진 상태로 둔다
 * (호출부가 scheduled=false 로 화면에 알린다).
 */
export async function syncCampaign(
  supabase: SupabaseClient,
  userId: string,
  row: ContractLinkRow,
): Promise<string | null> {
  try {
    if (row.contract_status === "canceled" || !row.influencer_id) {
      if (row.campaign_id) {
        const { error } = await supabase
          .from("influencer_campaigns")
          .delete()
          .eq("id", row.campaign_id);
        if (error) throw error;
      }
      return null;
    }

    const payload = {
      campaign_name: TMA_CAMPAIGN_NAME,
      status: CONTRACT_TO_CAMPAIGN_STATUS[row.contract_status],
      product_name: PRODUCT_LABEL[row.product],
      cost: row.collab_type === "paid" ? row.ad_fee_total : row.agreed_value,
      ship_date: row.product_ship_date,
      expected_post_date: row.post_planned_date,
      actual_post_date: row.post_actual_date,
    };

    if (row.campaign_id) {
      const { error } = await supabase
        .from("influencer_campaigns")
        .update(payload)
        .eq("id", row.campaign_id);
      if (error) throw error;
      return row.campaign_id;
    }

    const { data, error } = await supabase
      .from("influencer_campaigns")
      .insert({ influencer_id: row.influencer_id, created_by: userId, ...payload })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  } catch (error) {
    console.error("[contracts] 시딩 스케줄 동기화 실패:", error);
    return row.contract_status === "canceled" ? row.campaign_id : null;
  }
}

/** 지출 자동 기록에 쓸 분류 확보 — 없으면 만들고, 숨겨져 있으면 되살린다 */
async function ensureExpenseCategory(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: existing, error: findErr } = await supabase
    .from("expense_categories")
    .select("id, is_active")
    .eq("name", EXPENSE_CATEGORY_NAME)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) {
    if (!existing.is_active) {
      await supabase.from("expense_categories").update({ is_active: true }).eq("id", existing.id);
    }
    return existing.id as string;
  }
  const { data, error } = await supabase
    .from("expense_categories")
    .insert({ name: EXPENSE_CATEGORY_NAME, is_sensitive: false, sort_order: 50, created_by: userId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * 정산 완료 → 지출관리 자동 기록. 이미 기록됐으면(expense_id) 건너뛴다.
 * 상태 변경 이후의 후처리라 실패해도 throw 하지 않는다(반환 금액 0 → 화면이 안내).
 */
async function recordSettlementExpense(
  supabase: SupabaseClient,
  userId: string,
  row: ContractLinkRow,
): Promise<number> {
  try {
    if (row.contract_status !== "settled" || row.expense_id) return 0;
    const payout = getContractPayout(row);
    if (payout <= 0) return 0;

    const categoryId = await ensureExpenseCategory(supabase, userId);
    const handle = row.instagram_handle ? ` (@${row.instagram_handle})` : "";
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        expense_date: toDateString(kstNow()),
        vendor: row.name,
        description: `TMA 계약 정산 — ${row.name}${handle}`,
        amount_krw: payout,
        currency: "KRW",
        amount_foreign: null,
        payment_method: EXPENSE_PAYMENT_METHOD,
        category_id: categoryId,
        source: "manual",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    await supabase
      .from("influencer_contracts")
      .update({ expense_id: data.id })
      .eq("id", row.id);
    revalidatePath("/dashboard/expenses");
    return payout;
  } catch (error) {
    console.error("[contracts] 지출 자동 기록 실패:", error);
    return 0;
  }
}

/** 동기화 결과(campaign_id)를 계약 행에 반영 */
export async function saveCampaignId(
  supabase: SupabaseClient,
  contractId: string,
  before: string | null,
  after: string | null,
): Promise<void> {
  if (before === after) return;
  await supabase
    .from("influencer_contracts")
    .update({ campaign_id: after })
    .eq("id", contractId);
}

/**
 * 저장 공통 후처리(생성/수정/상태변경/전자서명 완료가 공유) — 캠페인 동기화와
 * 지출 자동 기록은 서로 독립이라 병렬로 돌리고, 마지막에 연동 화면 3곳을 갱신한다.
 */
export async function finishContractSave(
  supabase: SupabaseClient,
  userId: string,
  row: ContractLinkRow,
): Promise<{ scheduled: boolean; expenseAmount: number }> {
  const [campaignId, expenseAmount] = await Promise.all([
    syncCampaign(supabase, userId, row).then(async (id) => {
      await saveCampaignId(supabase, row.id, row.campaign_id, id);
      return id;
    }),
    recordSettlementExpense(supabase, userId, row),
  ]);
  revalidateLinkedPaths();
  return { scheduled: Boolean(campaignId), expenseAmount };
}
