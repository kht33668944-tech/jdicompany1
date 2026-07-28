"use server";

// 시딩 성과 갱신 — 사용자가 "성과 새로고침"을 누를 때만 실행된다(자동 주기 갱신 없음).

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/supabase/auth";

export interface CampaignResult {
  likes: number | null;
  comments: number | null;
  views: number | null;
}

async function requireAuth() {
  const auth = await getAuthUser();
  if (!auth) throw new Error("로그인이 필요합니다.");
  return auth;
}

/**
 * 캠페인에 연결된 게시물의 수치를 캠페인에 복사한다.
 * 게시물이 최근 목록에서 밀려나 못 찾으면 `null` 을 돌려주고,
 * 이미 저장된 수치는 그대로 둔다.
 */
export async function refreshCampaignResult(
  campaignId: string
): Promise<CampaignResult | null> {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase.rpc("refresh_campaign_result", {
    p_campaign_id: campaignId,
  });
  if (error) throw new Error(`성과를 갱신하지 못했습니다: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;

  revalidatePath("/dashboard/influencer");
  return {
    likes: row.likes ?? null,
    comments: row.comments ?? null,
    views: row.views ?? null,
  };
}

export interface SeedingHistory {
  campaign_count: number;
  done_count: number;
  total_cost: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  avg_views: number | null;
  cost_per_10k_views: number | null;
}

/** 인플루언서별 자사 실적. 팔로워 등급과 별개로 재섭외 판단에 쓴다. */
export async function getSeedingHistory(influencerId: string): Promise<SeedingHistory | null> {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase.rpc("get_influencer_seeding_history", {
    p_influencer_id: influencerId,
  });
  if (error) throw new Error(`실적을 불러오지 못했습니다: ${error.message}`);

  return (data as SeedingHistory) ?? null;
}
