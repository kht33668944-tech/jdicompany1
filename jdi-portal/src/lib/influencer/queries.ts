import { createClient } from "@/lib/supabase/server";
import type {
  Influencer,
  InfluencerWithPosts,
  InfluencerCampaign,
  InfluencerFilterOpts,
  InfluencerKpiSnapshot,
  KpiCards,
} from "./types";

export async function getInfluencers(opts: InfluencerFilterOpts = {}): Promise<Influencer[]> {
  const supabase = await createClient();
  const {
    grade,
    category,
    status = "active",
    search,
    sortBy = "engagement_rate",
    sortOrder = "desc",
    page = 1,
    pageSize = 50,
  } = opts;

  let query = supabase
    .from("influencers")
    .select(
      "id, created_by, platform, username, profile_url, display_name, bio, profile_image_url, " +
      "follower_count, following_count, post_count, avg_likes, avg_comments, engagement_rate, " +
      "grade, category, ai_insights, ai_summary, tags, notes, status, last_synced_at, created_at, updated_at"
    );

  if (status) query = query.eq("status", status);
  if (grade) query = query.eq("grade", grade);
  if (category) query = query.eq("category", category);
  if (search) {
    query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
  }

  query = query
    .order(sortBy, { ascending: sortOrder === "asc", nullsFirst: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as Influencer[]) ?? [];
}

export async function getInfluencerById(id: string): Promise<InfluencerWithPosts | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("influencers")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;

  const { data: posts, error: postsError } = await supabase
    .from("influencer_posts")
    .select("id, influencer_id, post_url, thumbnail_url, caption, likes, comments, posted_at, fetched_at")
    .eq("influencer_id", id)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(12);

  if (postsError) throw postsError;

  return {
    ...(data as Influencer),
    recent_posts: posts ?? [],
  };
}

export async function getCampaignsByInfluencer(influencer_id: string): Promise<InfluencerCampaign[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("influencer_campaigns")
    .select("*")
    .eq("influencer_id", influencer_id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as InfluencerCampaign[]) ?? [];
}

export async function getActiveCampaigns(): Promise<InfluencerCampaign[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("influencer_campaigns")
    .select("*")
    .not("status", "in", '("done")')
    .order("ship_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data as InfluencerCampaign[]) ?? [];
}

function calcDeltaPct(current: number | null, prev: number | null): number | null {
  if (current === null || prev === null || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

export async function getKpiCards(): Promise<KpiCards> {
  const supabase = await createClient();

  const [totalRes, engagementRes, followerRes, campaignRes, snapshotRes] = await Promise.all([
    supabase
      .from("influencers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("influencers")
      .select("engagement_rate")
      .eq("status", "active")
      .not("engagement_rate", "is", null),
    supabase
      .from("influencers")
      .select("follower_count, engagement_rate")
      .eq("status", "active")
      .not("follower_count", "is", null)
      .not("engagement_rate", "is", null),
    supabase
      .from("influencer_campaigns")
      .select("status"),
    supabase
      .from("influencer_kpi_weekly_snapshots")
      .select("total_count, avg_engagement_rate, estimated_reach, campaign_progress_rate")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (totalRes.error) throw totalRes.error;
  if (engagementRes.error) throw engagementRes.error;
  if (followerRes.error) throw followerRes.error;
  if (campaignRes.error) throw campaignRes.error;
  if (snapshotRes.error) throw snapshotRes.error;

  // 평균 ER
  const erValues = (engagementRes.data ?? [])
    .map((r) => (r as { engagement_rate: number }).engagement_rate)
    .filter((v): v is number => v !== null);
  const avgEngagementRate =
    erValues.length > 0
      ? erValues.reduce((a, b) => a + b, 0) / erValues.length
      : null;

  // 예상 도달: SUM(follower * ER * 0.003)
  const estimatedReach =
    (followerRes.data ?? [])
      .map((r) => {
        const row = r as { follower_count: number; engagement_rate: number };
        return row.follower_count * row.engagement_rate * 0.003;
      })
      .reduce((a, b) => a + b, 0) || null;

  // 시딩 진행률
  const campaigns = (campaignRes.data ?? []) as { status: string }[];
  const totalCampaigns = campaigns.length;
  const doneCampaigns = campaigns.filter((c) =>
    ["shipped", "posted", "done"].includes(c.status)
  ).length;
  const campaignProgressRate =
    totalCampaigns > 0 ? (doneCampaigns / totalCampaigns) * 100 : 0;

  const prev = snapshotRes.data as InfluencerKpiSnapshot | null;
  const prevTotal = prev?.total_count ?? null;
  const prevER = prev?.avg_engagement_rate ?? null;
  const prevReach = prev != null
    ? typeof prev.estimated_reach === "bigint"
      ? Number(prev.estimated_reach)
      : (prev.estimated_reach as number | null)
    : null;
  const prevProgress = prev?.campaign_progress_rate ?? null;

  const totalCount = totalRes.count ?? 0;

  return {
    totalInfluencers: {
      value: totalCount,
      deltaPct: calcDeltaPct(totalCount, prevTotal),
    },
    avgEngagementRate: {
      value: avgEngagementRate,
      deltaPct: calcDeltaPct(avgEngagementRate, prevER),
    },
    estimatedReach: {
      value: estimatedReach,
      deltaPct: calcDeltaPct(estimatedReach, prevReach),
    },
    campaignProgressRate: {
      value: campaignProgressRate,
      deltaPct: calcDeltaPct(campaignProgressRate, prevProgress),
    },
  };
}

export async function getCategories(): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("influencers")
    .select("category")
    .not("category", "is", null)
    .eq("status", "active");

  if (error) throw error;

  const unique = [
    ...new Set(
      (data ?? [])
        .map((r) => (r as { category: string | null }).category)
        .filter((c): c is string => c !== null && c.trim() !== "")
    ),
  ].sort();

  return unique;
}
