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

/**
 * 계약 상태 → 시딩 캠페인 상태 매핑.
 * 계약 10단계가 캠페인 6단계로 좁아지므로 여러 계약 상태가 한 칸으로 모인다.
 * 그래서 화면에서는 계약이 연결된 행에 캠페인 상태 대신 계약 상태를 그대로 보여준다
 * (이 매핑은 계약 없는 캠페인과 섞여 도는 스케줄·깔때기용 근사값).
 * 취소는 캠페인을 지우지 않고 마지막 상태 그대로 남긴다(이력 보존).
 */
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

/**
 * 캠페인 상태 → 계약 상태 역매핑(대표값).
 * 리스트·스케줄에서 캠페인만 고쳤을 때 계약이 뒤처지지 않게 하는 안전망이다.
 * 한 캠페인 상태에 계약 상태 여럿이 대응하므로, 지금 계약 상태가 이미 같은 묶음
 * 안에 있으면 그대로 두고(더 자세한 정보를 잃지 않는다) 아니면 대표값으로 옮긴다.
 */
export const CAMPAIGN_TO_CONTRACT_GROUP: Record<CampaignStatus, ContractStatus[]> = {
  planned: ["candidate"],
  dm_sent: ["dm_sent"],
  replied: ["negotiating", "contract_sent", "signed"],
  shipped: ["product_shipped", "draft_received"],
  posted: ["posted"],
  done: ["settled"],
};

/**
 * 캠페인 상태 변경을 계약 상태로 옮긴다.
 * 취소된 계약은 캠페인 조작으로 되살리지 않는다(취소는 계약 탭에서만 푼다).
 */
export function resolveContractStatus(
  current: ContractStatus,
  next: CampaignStatus,
): ContractStatus {
  if (current === "canceled") return current;
  const group = CAMPAIGN_TO_CONTRACT_GROUP[next];
  if (!group) return current;
  return group.includes(current) ? current : group[0];
}

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
  draft_due_date: string | null;
  post_planned_date: string | null;
  post_actual_date: string | null;
  contract_status: ContractStatus;
}

export const LINK_COLUMNS =
  "id, influencer_id, campaign_id, expense_id, name, instagram_handle, collab_type, product, " +
  "agreed_value, ad_fee_total, secondary_usage, secondary_usage_fee, raw_footage, raw_footage_fee, " +
  "product_ship_date, draft_due_date, post_planned_date, post_actual_date, contract_status";

/** 연동 화면 3곳(계약/리스트/시딩 스케줄)을 함께 갱신 */
export function revalidateLinkedPaths() {
  revalidatePath(CONTRACTS_PATH);
  revalidatePath("/dashboard/influencer");
  revalidatePath("/dashboard/influencer/schedule");
}

/**
 * 계약 → 시딩 캠페인 동기화. 반환값은 최종 campaign_id(연동 없으면 null).
 * 계약 저장 이후에 도는 후처리라, 실패해도 throw 하지 않고 연동만 빠진 상태로 둔다
 * (호출부가 scheduled=false 로 화면에 알린다).
 *
 * 취소·삭제된 계약의 캠페인은 **지우지 않는다**. 예전에는 지웠는데, 그러면
 * 리스트·스케줄에서 "이 사람 그때 어디까지 갔었는지" 기록이 통째로 사라졌다.
 * 대신 캠페인은 마지막 상태 그대로 두고, 화면이 계약의 '취소' 배지를 덧입혀 보여준다.
 */
export async function syncCampaign(
  supabase: SupabaseClient,
  userId: string,
  row: ContractLinkRow,
): Promise<string | null> {
  try {
    if (row.contract_status === "canceled") return row.campaign_id;
    if (!row.influencer_id) return row.campaign_id;

    const payload = {
      campaign_name: TMA_CAMPAIGN_NAME,
      status: CONTRACT_TO_CAMPAIGN_STATUS[row.contract_status],
      product_name: PRODUCT_LABEL[row.product],
      cost: row.collab_type === "paid" ? row.ad_fee_total : row.agreed_value,
      ship_date: row.product_ship_date,
      content_deadline: row.draft_due_date,
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
    return row.campaign_id;
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

/** 캠페인 → 계약 역방향으로 옮길 수 있는 값들 (리스트·스케줄에서 캠페인만 고쳤을 때) */
export interface CampaignPatchForContract {
  status?: CampaignStatus;
  cost?: number | null;
  ship_date?: string | null;
  content_deadline?: string | null;
  expected_post_date?: string | null;
  actual_post_date?: string | null;
}

/**
 * 캠페인 → 계약 역방향 동기화.
 *
 * 리스트·시딩 스케줄에서 캠페인만 고치면 계약이 뒤처지고, 다음에 계약을 저장하는 순간
 * 계약 값이 캠페인을 덮어써서 방금 한 작업이 조용히 사라졌다. 그래서 캠페인을 고치는
 * 서버 액션은 모두 이 함수를 지나 계약에도 같은 값을 남긴다.
 *
 * 계약과 연결되지 않은 캠페인(리스트에서 '시딩 시작'으로 만든 것)은 그냥 통과한다.
 * 저장 이후에 도는 후처리라 실패해도 throw 하지 않는다(캠페인 저장은 이미 끝났다).
 */
export async function syncContractFromCampaign(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string,
  patch: CampaignPatchForContract,
): Promise<void> {
  try {
    const { data: current, error: findErr } = await supabase
      .from("influencer_contracts")
      .select("id, collab_type, contract_status")
      .eq("campaign_id", campaignId)
      .eq("is_deleted", false)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!current) return; // 계약과 무관한 캠페인

    const contractPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) {
      contractPatch.contract_status = resolveContractStatus(
        current.contract_status as ContractStatus,
        patch.status,
      );
    }
    if (patch.cost !== undefined) {
      // 광고비형은 광고비 총액, 순수협찬형은 약정가액에 대응한다(syncCampaign 과 같은 규칙)
      const column = current.collab_type === "paid" ? "ad_fee_total" : "agreed_value";
      contractPatch[column] = patch.cost;
    }
    if (patch.ship_date !== undefined) contractPatch.product_ship_date = patch.ship_date;
    if (patch.content_deadline !== undefined) contractPatch.draft_due_date = patch.content_deadline;
    if (patch.expected_post_date !== undefined) {
      contractPatch.post_planned_date = patch.expected_post_date;
    }
    if (patch.actual_post_date !== undefined) {
      contractPatch.post_actual_date = patch.actual_post_date;
    }
    if (Object.keys(contractPatch).length === 0) return;

    const { data, error } = await supabase
      .from("influencer_contracts")
      .update(contractPatch)
      .eq("id", current.id)
      .eq("is_deleted", false)
      .select(LINK_COLUMNS)
      .single();
    if (error) throw error;

    // 리스트에서 '완료'로 넘겨 계약이 '정산 완료'가 된 경우도 계약 탭과 똑같이 지출을 남긴다
    await recordSettlementExpense(supabase, userId, data as unknown as ContractLinkRow);
    revalidateLinkedPaths();
  } catch (error) {
    console.error("[contracts] 계약 역방향 동기화 실패:", error);
  }
}
