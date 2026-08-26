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
import { getContractAmount, getContractAmountColumn, getContractPayout } from "./payout";
import { CONTRACT_TO_CAMPAIGN_STATUS, resolveContractStatus } from "./statusMap";
import type { ContractStatus, InfluencerContract } from "./types";

export const CONTRACTS_PATH = "/dashboard/influencer/contracts";

// 계약 10단계 ↔ 캠페인 6단계 대응표는 statusMap.ts(클라이언트 공용)에 있다.
// 리스트·시딩 스케줄 화면도 같은 표로 상태를 보여줘야 하는데, 이 파일은 next/cache 를
// 쓰는 서버 전용이라 클라이언트가 가져갈 수 없어서 분리했다. 기존 import 경로가
// 깨지지 않도록 여기서 다시 내보낸다.
export {
  CONTRACT_TO_CAMPAIGN_STATUS,
  CAMPAIGN_TO_CONTRACT_GROUP,
  campaignToContractStatus,
  resolveContractStatus,
} from "./statusMap";

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
 * 계약에 붙일 기존 시딩건 찾기 — 같은 인플루언서의 캠페인 중에서
 * 아직 살아있는 다른 계약이 물고 있지 않은 것을 최신순으로 하나 고른다.
 *
 * 이 확인이 없던 시절에는 계약을 저장할 때마다 곧장 새 캠페인을 만들어서,
 * 리스트에서 '시딩 시작'으로 이미 만들어 둔 사람에게 계약을 추가하면
 * **이름까지 똑같은 시딩건이 하나 더** 생겼다(KPI·깔때기 이중 카운트,
 * 시딩 스케줄에 같은 사람이 두 줄, 리스트 "시딩 금액 2건").
 */
async function findAdoptableCampaign(
  supabase: SupabaseClient,
  row: ContractLinkRow,
): Promise<string | null> {
  if (!row.influencer_id) return null;

  const { data: campaigns, error } = await supabase
    .from("influencer_campaigns")
    .select("id")
    .eq("influencer_id", row.influencer_id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!campaigns || campaigns.length === 0) return null;

  const ids = campaigns.map((c) => c.id as string);
  const { data: taken, error: takenErr } = await supabase
    .from("influencer_contracts")
    .select("campaign_id")
    .in("campaign_id", ids)
    .eq("is_deleted", false)
    .neq("id", row.id);
  if (takenErr) throw takenErr;

  const takenIds = new Set((taken ?? []).map((t) => t.campaign_id as string));
  return ids.find((id) => !takenIds.has(id)) ?? null;
}

/**
 * 「DM 추적」이 켜지도록 연락일을 채운다.
 *
 * 사이드바 DM 추적은 캠페인 `contact_date` 로 며칠 지났는지 센다. 그런데 계약에는
 * DM 보낸 날짜 칸이 없어서, 계약으로만 관리하면 이 값이 영영 비어 있고 추적이
 * 한 번도 켜지지 않았다. '제안 DM' 단계에 들어올 때 비어 있으면 오늘(KST)을 대신
 * 넣어 준다. 이미 값이 있으면 사람이 적은 날짜이므로 건드리지 않는다.
 */
async function resolveContactDatePatch(
  supabase: SupabaseClient,
  row: ContractLinkRow,
  campaignId: string,
): Promise<{ contact_date?: string }> {
  if (row.contract_status !== "dm_sent") return {};
  const { data } = await supabase
    .from("influencer_campaigns")
    .select("contact_date")
    .eq("id", campaignId)
    .maybeSingle();
  if (data && !data.contact_date) return { contact_date: toDateString(kstNow()) };
  return {};
}

/**
 * 계약 → 시딩 캠페인 동기화. 반환값은 최종 campaign_id(연동 없으면 null).
 * 계약 저장 이후에 도는 후처리라, 실패해도 throw 하지 않고 연동만 빠진 상태로 둔다
 * (호출부가 scheduled=false 로 화면에 알린다).
 *
 * 시딩 1건 = 계약 1건이 규칙이다. 그래서 ① 연결된 캠페인이 없으면 먼저 기존 것을
 * 찾아 흡수하고(없을 때만 새로 만든다) ② 취소·삭제된 계약의 캠페인은 실제로 지운다.
 * 지워도 이력은 계약 쪽(소프트 삭제 + '취소' 상태)에 그대로 남으므로 잃는 정보가 없고,
 * 남겨 두면 리스트·스케줄·깔때기·KPI 에 유령 건수로 영원히 잡힌다.
 */
export async function syncCampaign(
  supabase: SupabaseClient,
  userId: string,
  row: ContractLinkRow,
): Promise<string | null> {
  try {
    if (row.contract_status === "canceled") {
      if (row.campaign_id) {
        const { error } = await supabase
          .from("influencer_campaigns")
          .delete()
          .eq("id", row.campaign_id);
        if (error) throw error;
      }
      return null;
    }
    if (!row.influencer_id) return row.campaign_id;

    const payload = {
      campaign_name: TMA_CAMPAIGN_NAME,
      status: CONTRACT_TO_CAMPAIGN_STATUS[row.contract_status],
      product_name: PRODUCT_LABEL[row.product],
      cost: getContractAmount(row),
      ship_date: row.product_ship_date,
      content_deadline: row.draft_due_date,
      expected_post_date: row.post_planned_date,
      actual_post_date: row.post_actual_date,
    };

    const targetId = row.campaign_id ?? (await findAdoptableCampaign(supabase, row));

    if (targetId) {
      const contactPatch = await resolveContactDatePatch(supabase, row, targetId);
      const { error } = await supabase
        .from("influencer_campaigns")
        .update({ ...payload, ...contactPatch })
        .eq("id", targetId);
      if (error) throw error;
      return targetId;
    }

    const { data, error } = await supabase
      .from("influencer_campaigns")
      .insert({
        influencer_id: row.influencer_id,
        created_by: userId,
        ...payload,
        ...(row.contract_status === "dm_sent" && { contact_date: toDateString(kstNow()) }),
      })
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
      const column = getContractAmountColumn(current.collab_type as InfluencerContract["collab_type"]);
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
