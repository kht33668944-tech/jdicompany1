import type { PayoutStatus } from "./contact-types";

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

export type InfluencerListItem = Omit<
  Influencer,
  "bio" | "ai_insights" | "ai_summary" | "notes"
>;

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
  // 배송·지급 (마이그 111)
  courier: string | null;
  tracking_number: string | null;
  payout_status: PayoutStatus;
  paid_at: string | null;
  expense_id: string | null;
  // 성과 스냅샷 (마이그 112) — 게시물이 최근 목록에서 밀려나도 남도록 복사해 보관
  result_likes: number | null;
  result_comments: number | null;
  result_views: number | null;
  result_captured_at: string | null;
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
  /** 시딩으로 실제 얻은 총 조회수 (마이그 112) */
  totalResultViews: { value: number };
  /** 1만 조회당 원가. 성과가 없으면 null */
  costPer10kViews: { value: number | null };
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
