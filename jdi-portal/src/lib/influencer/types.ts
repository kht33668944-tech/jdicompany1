export type InfluencerGrade = "S" | "A" | "B" | "C" | "UNRATED";
export type InfluencerStatus = "active" | "archived";
export type CampaignStatus =
  | "planned"
  | "dm_sent"
  | "replied"
  | "shipped"
  | "posted"
  | "done";

export interface Influencer {
  id: string;
  created_by: string;
  platform: string;
  username: string;
  profile_url: string;
  display_name: string | null;
  bio: string | null;
  profile_image_url: string | null;
  profile_image_path: string | null;
  follower_count: number | null;
  following_count: number | null;
  post_count: number | null;
  avg_likes: number | null;
  avg_comments: number | null;
  engagement_rate: number | null;
  grade: InfluencerGrade;
  category: string | null;
  ai_insights: AiInsights | null;
  ai_summary: string | null;
  tags: string[] | null;
  notes: string | null;
  status: InfluencerStatus;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiInsights {
  category: string | null;
  persona: string | null;
  approach: string | null;
  fake_signal: string | null;
}

export type InfluencerPostType = "image" | "video" | "carousel";
export type InfluencerProductType = "feed" | "clips" | "igtv";

export interface InfluencerPost {
  id: string;
  influencer_id: string;
  post_url: string | null;
  thumbnail_url: string | null;
  thumbnail_path: string | null;
  caption: string | null;
  likes: number | null;
  comments: number | null;
  posted_at: string | null;
  fetched_at: string;
  post_type: InfluencerPostType | null;
  product_type: InfluencerProductType | null;
  view_count: number | null;
  is_sponsored: boolean;
  hashtags: string[];
  child_thumbnails: string[];
  child_thumbnail_paths: string[];
  video_url: string | null;
}

export interface InfluencerCampaign {
  id: string;
  influencer_id: string;
  created_by: string;
  campaign_name: string;
  status: CampaignStatus;
  product_name: string | null;
  cost: number | null;
  contact_date: string | null;
  contract_date: string | null;
  ship_date: string | null;
  content_deadline: string | null;
  expected_post_date: string | null;
  actual_post_date: string | null;
  post_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InfluencerKpiSnapshot {
  id: string;
  snapshot_date: string;
  total_count: number | null;
  avg_engagement_rate: number | null;
  estimated_reach: bigint | number | null;
  campaign_progress_rate: number | null;
  created_at: string;
}

export interface InfluencerWithPosts extends Influencer {
  recent_posts: InfluencerPost[];
}

export type InfluencerCampaignWithInfluencer = InfluencerCampaign & {
  influencer: {
    username: string;
    display_name: string | null;
    profile_image_url: string | null;
    profile_image_path: string | null;
  } | null;
};

export interface InfluencerFilterOpts {
  grade?: InfluencerGrade;
  category?: string;
  status?: InfluencerStatus;
  search?: string;
  sortBy?: "engagement_rate" | "follower_count" | "created_at" | "updated_at";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface KpiCards {
  totalInfluencers: { value: number; deltaPct: number | null };
  activeCampaigns: { value: number };
  doneCampaigns: { value: number };
  totalSeedingCost: { value: number };
}

export type CampaignBasic = Pick<
  InfluencerCampaign,
  | "id"
  | "influencer_id"
  | "status"
  | "cost"
  | "contact_date"
  | "contract_date"
  | "ship_date"
  | "content_deadline"
  | "expected_post_date"
>;
