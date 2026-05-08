-- 074_influencer.sql
-- 인플루언서 마케팅 관리 도메인 — 5개 테이블 + RLS + 인덱스

-- ============================================================
-- 1. influencers (메인)
-- ============================================================
CREATE TABLE public.influencers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  platform text NOT NULL DEFAULT 'instagram',
  username text NOT NULL,
  profile_url text NOT NULL,
  display_name text,
  bio text,
  profile_image_url text,
  follower_count int,
  following_count int,
  post_count int,
  avg_likes numeric,
  avg_comments numeric,
  engagement_rate numeric,
  grade text CHECK (grade IN ('S','A','B','C','UNRATED')) DEFAULT 'UNRATED',
  category text,
  ai_insights jsonb,
  ai_summary text,
  tags text[] DEFAULT '{}',
  notes text,
  status text DEFAULT 'active',
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (platform, username)
);

ALTER TABLE public.influencers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view influencers"
  ON public.influencers FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Approved users can create influencers"
  ON public.influencers FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());

CREATE POLICY "Approved users can update influencers"
  ON public.influencers FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());

CREATE POLICY "Approved users can delete influencers"
  ON public.influencers FOR DELETE TO authenticated
  USING (public.is_approved_user());

CREATE INDEX idx_influencers_created_by_status ON public.influencers (created_by, status);
CREATE INDEX idx_influencers_engagement_rate ON public.influencers (engagement_rate DESC);
CREATE INDEX idx_influencers_grade ON public.influencers (grade);
CREATE INDEX idx_influencers_category ON public.influencers (category);

-- ============================================================
-- 2. influencer_posts (최근 12~20개 게시물)
-- ============================================================
CREATE TABLE public.influencer_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id uuid REFERENCES public.influencers(id) ON DELETE CASCADE,
  post_url text,
  thumbnail_url text,
  caption text,
  likes int,
  comments int,
  posted_at timestamptz,
  fetched_at timestamptz DEFAULT now()
);

ALTER TABLE public.influencer_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view influencer_posts"
  ON public.influencer_posts FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Approved users can create influencer_posts"
  ON public.influencer_posts FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user());

CREATE POLICY "Approved users can update influencer_posts"
  ON public.influencer_posts FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());

CREATE POLICY "Approved users can delete influencer_posts"
  ON public.influencer_posts FOR DELETE TO authenticated
  USING (public.is_approved_user());

CREATE INDEX idx_influencer_posts_influencer_posted ON public.influencer_posts (influencer_id, posted_at DESC);

-- ============================================================
-- 3. influencer_campaigns (시딩 진행)
-- ============================================================
CREATE TABLE public.influencer_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id uuid REFERENCES public.influencers(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id),
  campaign_name text,
  status text DEFAULT 'planned',
  -- planned/dm_sent/replied/shipped/posted/done
  product_name text,
  cost numeric,
  contact_date date,
  ship_date date,
  expected_post_date date,
  actual_post_date date,
  post_url text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.influencer_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view influencer_campaigns"
  ON public.influencer_campaigns FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Approved users can create influencer_campaigns"
  ON public.influencer_campaigns FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());

CREATE POLICY "Approved users can update influencer_campaigns"
  ON public.influencer_campaigns FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());

CREATE POLICY "Approved users can delete influencer_campaigns"
  ON public.influencer_campaigns FOR DELETE TO authenticated
  USING (public.is_approved_user());

CREATE INDEX idx_influencer_campaigns_status_date ON public.influencer_campaigns (status, expected_post_date);

-- ============================================================
-- 4. influencer_sync_logs
-- ============================================================
CREATE TABLE public.influencer_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id uuid REFERENCES public.influencers(id) ON DELETE CASCADE,
  status text,
  error_message text,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now()
);

ALTER TABLE public.influencer_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view influencer_sync_logs"
  ON public.influencer_sync_logs FOR SELECT TO authenticated
  USING (public.is_approved_user());

-- sync_logs INSERT는 Edge Function(service_role) 전용 — 일반 사용자 직접 삽입 차단
CREATE POLICY "Block direct insert to influencer_sync_logs"
  ON public.influencer_sync_logs FOR INSERT TO authenticated
  WITH CHECK (FALSE);

CREATE POLICY "Approved users can update influencer_sync_logs"
  ON public.influencer_sync_logs FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());

CREATE POLICY "Approved users can delete influencer_sync_logs"
  ON public.influencer_sync_logs FOR DELETE TO authenticated
  USING (public.is_approved_user());

-- ============================================================
-- 5. influencer_kpi_weekly_snapshots (KPI 변동률 계산용)
-- ============================================================
CREATE TABLE public.influencer_kpi_weekly_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  total_count int,
  avg_engagement_rate numeric,
  estimated_reach bigint,
  campaign_progress_rate numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE (snapshot_date)
);

ALTER TABLE public.influencer_kpi_weekly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view influencer_kpi_weekly_snapshots"
  ON public.influencer_kpi_weekly_snapshots FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Approved users can create influencer_kpi_weekly_snapshots"
  ON public.influencer_kpi_weekly_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user());

CREATE POLICY "Approved users can update influencer_kpi_weekly_snapshots"
  ON public.influencer_kpi_weekly_snapshots FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());

CREATE POLICY "Approved users can delete influencer_kpi_weekly_snapshots"
  ON public.influencer_kpi_weekly_snapshots FOR DELETE TO authenticated
  USING (public.is_approved_user());
