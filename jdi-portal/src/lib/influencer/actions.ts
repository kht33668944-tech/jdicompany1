"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CampaignStatus, InfluencerCampaign } from "./types";

async function getSessionUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  return session.user.id;
}

function validateInstagramUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "www.instagram.com" || parsed.hostname === "instagram.com") &&
      parsed.pathname.length > 1
    );
  } catch {
    return false;
  }
}

// ============================================================
// 인플루언서
// ============================================================

export async function addInfluencer(
  profileUrl: string
): Promise<{ ok: true; influencer_id: string }> {
  if (!validateInstagramUrl(profileUrl)) {
    throw new Error("올바른 인스타그램 프로필 URL을 입력해 주세요.");
  }

  const userId = await getSessionUserId();
  const supabase = await createClient();

  const { data: extractData, error: extractError } = await supabase.functions.invoke(
    "influencer-extract",
    { body: { profile_url: profileUrl, created_by: userId } }
  );

  if (extractError) throw new Error(`인플루언서 정보 수집 실패: ${extractError.message}`);

  const influencerId = (extractData as { influencer_id: string }).influencer_id;

  // analyze는 실패해도 인플루언서 등록 상태는 유지 (await로 완료 보장)
  try {
    await supabase.functions.invoke("influencer-analyze", {
      body: { influencer_id: influencerId },
    });
  } catch {
    // 분석 실패는 무시
  }

  revalidatePath("/dashboard/influencer");
  return { ok: true, influencer_id: influencerId };
}

export async function resyncAllInfluencers(): Promise<{
  total: number;
  success: number;
  failed: number;
}> {
  const userId = await getSessionUserId();
  const supabase = await createClient();

  const { data: list, error } = await supabase
    .from("influencers")
    .select("id, profile_url")
    .eq("status", "active");

  if (error) throw error;
  const items = list ?? [];

  let success = 0;
  let failed = 0;

  // Apify rate limit 회피를 위해 순차 호출
  for (const inf of items) {
    try {
      const { data: extractData, error: extractError } = await supabase.functions.invoke(
        "influencer-extract",
        { body: { profile_url: inf.profile_url, created_by: userId } },
      );
      if (extractError) {
        failed++;
        continue;
      }
      const influencerId = (extractData as { influencer_id: string }).influencer_id;
      try {
        await supabase.functions.invoke("influencer-analyze", {
          body: { influencer_id: influencerId },
        });
      } catch {
        // 분석 실패는 무시
      }
      success++;
    } catch {
      failed++;
    }
  }

  revalidatePath("/dashboard/influencer");
  return { total: items.length, success, failed };
}

export async function resyncInfluencer(id: string): Promise<void> {
  const userId = await getSessionUserId();
  const supabase = await createClient();

  const { data, error: fetchError } = await supabase
    .from("influencers")
    .select("profile_url")
    .eq("id", id)
    .single();

  if (fetchError) throw fetchError;

  const { data: extractData, error: extractError } = await supabase.functions.invoke(
    "influencer-extract",
    { body: { profile_url: data.profile_url, created_by: userId } }
  );

  if (extractError) throw new Error(`재동기화 실패: ${extractError.message}`);

  const influencerId = (extractData as { influencer_id: string }).influencer_id;

  try {
    await supabase.functions.invoke("influencer-analyze", {
      body: { influencer_id: influencerId },
    });
  } catch {
    // 분석 실패는 무시
  }

  revalidatePath("/dashboard/influencer");
}

export async function analyzeInfluencer(id: string): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase.functions.invoke("influencer-analyze", {
    body: { influencer_id: id },
  });

  if (error) throw new Error(`AI 분석 실패: ${error.message}`);

  revalidatePath("/dashboard/influencer");
}

export async function archiveInfluencer(id: string): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("influencers")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/dashboard/influencer");
}

export async function unarchiveInfluencer(id: string): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("influencers")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/dashboard/influencer");
}

export async function deleteInfluencer(id: string): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  // CASCADE로 posts/campaigns/sync_logs 자동 삭제
  const { error } = await supabase.from("influencers").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/dashboard/influencer");
}

export async function updateInfluencerNotes(id: string, notes: string): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("influencers")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/dashboard/influencer");
}

export async function updateInfluencerTags(id: string, tags: string[]): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("influencers")
    .update({ tags, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/dashboard/influencer");
}

// ============================================================
// 캠페인
// ============================================================

export async function addCampaign(input: {
  influencer_id: string;
  campaign_name: string;
  product_name?: string;
  cost?: number;
  contact_date?: string;
  ship_date?: string;
  expected_post_date?: string;
  notes?: string;
}): Promise<InfluencerCampaign> {
  const userId = await getSessionUserId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("influencer_campaigns")
    .insert({
      influencer_id: input.influencer_id,
      created_by: userId,
      campaign_name: input.campaign_name,
      status: "planned" as CampaignStatus,
      product_name: input.product_name ?? null,
      cost: input.cost ?? null,
      contact_date: input.contact_date ?? null,
      ship_date: input.ship_date ?? null,
      expected_post_date: input.expected_post_date ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath("/dashboard/influencer");
  return data as InfluencerCampaign;
}

export async function updateCampaignStatus(
  campaign_id: string,
  status: CampaignStatus
): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("influencer_campaigns")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", campaign_id);

  if (error) throw error;
  revalidatePath("/dashboard/influencer");
}

export async function updateCampaign(
  id: string,
  input: Partial<
    Pick<
      InfluencerCampaign,
      | "campaign_name"
      | "status"
      | "product_name"
      | "cost"
      | "contact_date"
      | "ship_date"
      | "expected_post_date"
      | "actual_post_date"
      | "post_url"
      | "notes"
    >
  >
): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("influencer_campaigns")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/dashboard/influencer");
}

export async function deleteCampaign(id: string): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase.from("influencer_campaigns").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/dashboard/influencer");
}
