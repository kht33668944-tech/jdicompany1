import { createClient } from "@/lib/supabase/server";
import { calcDeltaPct, mapKpiRpcResult, type KpiRpcResult } from "./kpi";
import type {
  CampaignStatus,
  Influencer,
  InfluencerListItem,
  InfluencerWithPosts,
  InfluencerCampaign,
  InfluencerCampaignWithInfluencer,
  InfluencerFilterOpts,
  InfluencerStatsItem,
  KpiCards,
} from "./types";

const CAMPAIGN_WITH_INFLUENCER_SELECT =
  "*, influencer:influencers(username, display_name, profile_image_url, profile_image_path)";

export async function getInfluencers(opts: InfluencerFilterOpts = {}): Promise<InfluencerListItem[]> {
  const supabase = await createClient();
  const {
    grade,
    category,
    status = "active",
    search,
    sortBy = "engagement_rate",
    sortOrder = "desc",
    page = 1,
    pageSize = 25,
  } = opts;

  let query = supabase
    .from("influencers")
    .select(
      "id, created_by, platform, username, profile_url, display_name, profile_image_url, profile_image_path, " +
      "follower_count, following_count, post_count, avg_likes, avg_comments, engagement_rate, " +
      "grade, category, tags, status, last_synced_at, created_at, updated_at"
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
  return (data as unknown as InfluencerListItem[]) ?? [];
}

/**
 * 계약 탭에서 쓸 리스트 지표 — 계약에 연결된 인플루언서만 골라 최소 컬럼으로 가져온다.
 * (계약 표에 팔로워·ER·등급을 같이 보여주고, 리스트로 바로 건너뛰게 하려고)
 */
export async function getInfluencerStats(ids: string[]): Promise<InfluencerStatsItem[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("influencers")
    .select("id, username, follower_count, engagement_rate, grade")
    .in("id", ids);

  if (error) throw error;
  return (data ?? []) as InfluencerStatsItem[];
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
    .select("id, influencer_id, post_url, thumbnail_url, thumbnail_path, caption, likes, comments, posted_at, fetched_at, post_type, product_type, view_count, is_sponsored, hashtags, child_thumbnails, child_thumbnail_paths, video_url")
    .eq("influencer_id", id)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(60);

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
    .select(CAMPAIGN_WITH_INFLUENCER_SELECT)
    .neq("status", "done")
    .order("ship_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data as unknown as InfluencerCampaignWithInfluencer[]) ?? [];
}

/**
 * 캠페인 전체(종료 포함) 한 번에 조회.
 * 인플루언서 메인 화면은 진행 중 목록도 필요한데, 이 결과에서 걸러 쓰면
 * 같은 행을 두 번 가져오지 않는다(예전엔 getActiveCampaigns 와 중복 조회).
 */
export async function getAllCampaigns(): Promise<InfluencerCampaignWithInfluencer[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("influencer_campaigns")
    .select(CAMPAIGN_WITH_INFLUENCER_SELECT)
    .order("ship_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data as unknown as InfluencerCampaignWithInfluencer[]) ?? [];
}

export async function getKpiCards(): Promise<KpiCards> {
  const supabase = await createClient();

  const rpcResult = await supabase.rpc("get_influencer_kpi_cards");
  if (!rpcResult.error && rpcResult.data) {
    return mapKpiRpcResult(rpcResult.data as KpiRpcResult);
  }

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
