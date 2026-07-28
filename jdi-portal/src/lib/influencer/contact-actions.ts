"use server";

// 인플루언서 연락처 / 협의 이력 / 배송·지급 서버 액션
// 서류는 document-actions.ts, 성과는 result-actions.ts 에 있다.

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/supabase/auth";
import type { InfluencerCampaignEvent, InfluencerContactInput } from "./contact-types";

async function requireAuth() {
  const auth = await getAuthUser();
  if (!auth) throw new Error("로그인이 필요합니다.");
  return auth;
}

/** 빈 문자열은 null 로 저장해 "값 없음"을 한 가지로 통일한다. */
function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// ============================================================
// 연락처 (배송 + 정산)
// ============================================================
export async function upsertInfluencerContact(
  influencerId: string,
  input: InfluencerContactInput
): Promise<void> {
  const { supabase, user } = await requireAuth();
  if (!influencerId) throw new Error("인플루언서를 찾을 수 없습니다.");

  const { error } = await supabase.from("influencer_contacts").upsert(
    {
      influencer_id: influencerId,
      recipient_name: trimOrNull(input.recipient_name),
      phone: trimOrNull(input.phone),
      postcode: trimOrNull(input.postcode),
      address1: trimOrNull(input.address1),
      address2: trimOrNull(input.address2),
      email: trimOrNull(input.email),
      bank_name: trimOrNull(input.bank_name),
      account_number: trimOrNull(input.account_number),
      account_holder: trimOrNull(input.account_holder),
      note: trimOrNull(input.note),
      created_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "influencer_id" }
  );
  if (error) throw new Error(`연락처 저장에 실패했습니다: ${error.message}`);

  revalidatePath("/dashboard/influencer");
}

// ============================================================
// 협의 이력
// ============================================================
export async function addCampaignEvent(
  campaignId: string,
  body: string
): Promise<InfluencerCampaignEvent> {
  const { supabase, user } = await requireAuth();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("내용을 입력해주세요.");

  const { data, error } = await supabase
    .from("influencer_campaign_events")
    .insert({
      campaign_id: campaignId,
      kind: "note",
      body: trimmed,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(`기록 저장에 실패했습니다: ${error.message}`);

  revalidatePath("/dashboard/influencer");
  return data as InfluencerCampaignEvent;
}

export async function deleteCampaignEvent(eventId: string): Promise<void> {
  const { supabase } = await requireAuth();
  // 삭제 가능 범위(본인이 쓴 note)는 RLS 가 강제한다.
  const { error } = await supabase.from("influencer_campaign_events").delete().eq("id", eventId);
  if (error) throw new Error(`기록 삭제에 실패했습니다: ${error.message}`);
  revalidatePath("/dashboard/influencer");
}

// ============================================================
// 배송
// ============================================================
export async function updateCampaignShipping(
  campaignId: string,
  input: { courier: string | null; tracking_number: string | null }
): Promise<void> {
  const { supabase } = await requireAuth();
  const { error } = await supabase
    .from("influencer_campaigns")
    .update({
      courier: trimOrNull(input.courier),
      tracking_number: trimOrNull(input.tracking_number),
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
  if (error) throw new Error(`배송 정보 저장에 실패했습니다: ${error.message}`);
  revalidatePath("/dashboard/influencer");
}

// ============================================================
// 지급 → 지출 자동 생성
// ============================================================
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function markCampaignPaid(
  campaignId: string,
  input: { paidAt: string; paymentMethod: string }
): Promise<void> {
  const { supabase } = await requireAuth();
  if (!DATE_RE.test(input.paidAt)) throw new Error("지급일 형식이 올바르지 않습니다.");
  const method = input.paymentMethod.trim();
  if (!method) throw new Error("결제수단을 선택해주세요.");

  // 지출 생성과 캠페인 갱신을 한 번에 처리한다.
  // 나눠서 하면 지출만 생기고 캠페인은 그대로인 부분 성공이 생긴다.
  const { error } = await supabase.rpc("mark_campaign_paid", {
    p_campaign_id: campaignId,
    p_paid_at: input.paidAt,
    p_payment_method: method,
  });
  if (error) throw new Error(`지급 처리에 실패했습니다: ${error.message}`);

  revalidatePath("/dashboard/influencer");
  revalidatePath("/dashboard/expenses");
}

export async function unmarkCampaignPaid(
  campaignId: string,
  deleteExpense: boolean
): Promise<void> {
  const { supabase } = await requireAuth();

  const { data: campaign, error: readErr } = await supabase
    .from("influencer_campaigns")
    .select("expense_id")
    .eq("id", campaignId)
    .single();
  if (readErr) throw new Error(`시딩을 찾지 못했습니다: ${readErr.message}`);

  const { error: updateErr } = await supabase
    .from("influencer_campaigns")
    .update({
      payout_status: "none",
      paid_at: null,
      expense_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
  if (updateErr) throw new Error(`지급 해제에 실패했습니다: ${updateErr.message}`);

  // 연결을 먼저 끊고 지출을 지운다. 순서가 반대면 FK 때문에 실패한다.
  if (deleteExpense && campaign?.expense_id) {
    const { error: deleteErr } = await supabase
      .from("expenses")
      .delete()
      .eq("id", campaign.expense_id);
    if (deleteErr) throw new Error(`연결된 지출 삭제에 실패했습니다: ${deleteErr.message}`);
  }

  revalidatePath("/dashboard/influencer");
  revalidatePath("/dashboard/expenses");
}
