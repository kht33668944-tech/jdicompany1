"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CampaignStatus, InfluencerCampaign } from "./types";
import type { MilestoneKind } from "./calendar";

const MILESTONE_COLUMN: Record<
  MilestoneKind,
  "contact_date" | "contract_date" | "ship_date" | "content_deadline" | "expected_post_date"
> = {
  dm: "contact_date",
  contract: "contract_date",
  ship: "ship_date",
  deadline: "content_deadline",
  post: "expected_post_date",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

function extractUsernameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "www.instagram.com" && parsed.hostname !== "instagram.com") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[0] ?? null;
  } catch {
    return null;
  }
}

// ============================================================
// 인플루언서
// ============================================================

export async function addInfluencer(
  profileUrl: string
): Promise<{ ok: true; influencer_id: string; alreadyExisted?: boolean }> {
  if (!validateInstagramUrl(profileUrl)) {
    throw new Error("올바른 인스타그램 프로필 URL을 입력해 주세요.");
  }

  const username = extractUsernameFromUrl(profileUrl);
  if (!username) {
    throw new Error("URL에서 사용자명을 추출할 수 없습니다.");
  }

  const userId = await getSessionUserId();
  const supabase = await createClient();

  // 이미 등록되어 있으면 Apify 호출 없이 기존 ID 반환 (비용·시간 절감)
  const { data: existing } = await supabase
    .from("influencers")
    .select("id")
    .eq("platform", "instagram")
    .eq("username", username)
    .maybeSingle();

  if (existing) {
    return { ok: true, influencer_id: existing.id, alreadyExisted: true };
  }

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
  contract_date?: string;
  ship_date?: string;
  content_deadline?: string;
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
      contract_date: input.contract_date ?? null,
      ship_date: input.ship_date ?? null,
      content_deadline: input.content_deadline ?? null,
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
      | "contract_date"
      | "ship_date"
      | "content_deadline"
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

export async function updateCampaignMilestoneDate(
  campaign_id: string,
  kind: MilestoneKind,
  date_str: string,
): Promise<void> {
  if (!DATE_RE.test(date_str)) throw new Error("잘못된 날짜 형식입니다.");
  const column = MILESTONE_COLUMN[kind];
  if (!column) throw new Error("알 수 없는 일정 종류입니다.");

  await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("influencer_campaigns")
    .update({ [column]: date_str, updated_at: new Date().toISOString() })
    .eq("id", campaign_id);

  if (error) throw error;
  revalidatePath("/dashboard/influencer");
}

// 인플루언서 라이트박스에서 게시물을 캠페인의 실제 결과 게시물로 연결.
// post_url + actual_post_date 채우고 status를 'posted'로 자동 전환.
export async function linkPostToCampaign(
  campaign_id: string,
  post_url: string,
  posted_at: string | null,
): Promise<InfluencerCampaign> {
  await getSessionUserId();
  const supabase = await createClient();

  const actualPostDate = posted_at
    ? new Date(posted_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("influencer_campaigns")
    .update({
      post_url,
      actual_post_date: actualPostDate,
      status: "posted" as CampaignStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaign_id)
    .select()
    .single();

  if (error) throw error;
  revalidatePath("/dashboard/influencer");
  return data as InfluencerCampaign;
}
