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

export async function getKpiCards(): Promise<KpiCards> {
  const supabase = await createClient();

  const [totalRes, campaignRes, engagementRes, followerRes, snapshotRes] = await Promise.all([
    supabase
      .from("influencers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("influencer_campaigns")
      .select("id", { count: "exact", head: true })
      .not("status", "in", '("done")'),
    supabase
      .from("influencers")
      .select("engagement_rate")
      .eq("status", "active")
      .not("engagement_rate", "is", null),
    supabase
      .from("influencers")
      .select("follower_count")
      .eq("status", "active")
      .not("follower_count", "is", null),
    supabase
      .from("influencer_kpi_weekly_snapshots")
      .select("*")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (totalRes.error) throw totalRes.error;
  if (campaignRes.error) throw campaignRes.error;
  if (engagementRes.error) throw engagementRes.error;
  if (followerRes.error) throw followerRes.error;
  if (snapshotRes.error) throw snapshotRes.error;

  const engagementRates = (engagementRes.data ?? [])
    .map((r) => (r as { engagement_rate: number }).engagement_rate)
    .filter((v): v is number => v !== null);
  const avgEngagementRate =
    engagementRates.length > 0
      ? engagementRates.reduce((a, b) => a + b, 0) / engagementRates.length
      : null;

  const totalFollowerReach = (followerRes.data ?? [])
    .map((r) => (r as { follower_count: number }).follower_count)
    .filter((v): v is number => v !== null)
    .reduce((a, b) => a + b, 0) || null;

  const prev = snapshotRes.data as InfluencerKpiSnapshot | null;

  return {
    totalInfluencers: totalRes.count ?? 0,
    activeCampaigns: campaignRes.count ?? 0,
    avgEngagementRate,
    totalFollowerReach,
    prevWeek: {
      totalInfluencers: prev?.total_influencers ?? null,
      activeCampaigns: prev?.active_campaigns ?? null,
      avgEngagementRate: prev?.avg_engagement_rate ?? null,
      totalFollowerReach: prev?.total_follower_reach ?? null,
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
