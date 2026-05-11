import { createClient } from "@/lib/supabase/server";
import type {
  CampaignBasic,
  CampaignStatus,
  Influencer,
  InfluencerWithPosts,
  InfluencerCampaign,
  InfluencerCampaignWithInfluencer,
  InfluencerFilterOpts,
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

export async function getActiveCampaigns(): Promise<InfluencerCampaignWithInfluencer[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("influencer_campaigns")
    .select("*, influencer:influencers(username, display_name, profile_image_url)")
    .neq("status", "done")
    .order("ship_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data as unknown as InfluencerCampaignWithInfluencer[]) ?? [];
}

function calcDeltaPct(current: number | null, prev: number | null): number | null {
  if (current === null || prev === null || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

export async function getAllCampaignsBasic(): Promise<CampaignBasic[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("influencer_campaigns")
    .select(
      "id, influencer_id, status, cost, contact_date, contract_date, ship_date, content_deadline, expected_post_date",
    );

  if (error) throw error;
  return (data as CampaignBasic[]) ?? [];
}

export async function getKpiCards(): Promise<KpiCards> {
  const supabase = await createClient();

  const [totalRes, campaignRes, snapshotRes] = await Promise.all([
    supabase
      .from("influencers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase.from("influencer_campaigns").select("status, cost"),
    supabase
      .from("influencer_kpi_weekly_snapshots")
      .select("total_count")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (totalRes.error) throw totalRes.error;
  if (campaignRes.error) throw campaignRes.error;
  if (snapshotRes.error) throw snapshotRes.error;

  const campaigns = (campaignRes.data ?? []) as {
    status: CampaignStatus;
    cost: number | null;
  }[];
  const activeCount = campaigns.filter((c) => c.status !== "done").length;
  const doneCount = campaigns.filter((c) => c.status === "done").length;
  const totalCost = campaigns.reduce((acc, c) => acc + (c.cost ?? 0), 0);

  const totalCount = totalRes.count ?? 0;
  const prevTotal =
    (snapshotRes.data as { total_count: number | null } | null)?.total_count ?? null;

  return {
    totalInfluencers: {
      value: totalCount,
      deltaPct: calcDeltaPct(totalCount, prevTotal),
    },
    activeCampaigns: { value: activeCount },
    doneCampaigns: { value: doneCount },
    totalSeedingCost: { value: totalCost },
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
