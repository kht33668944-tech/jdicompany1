-- 111_influencer_candidates.sql
-- 추천 인플루언서 발굴 — 후보/커서/실행기록 3개 테이블

-- ============================================================
-- 1. influencer_candidates (후보 명단 — 행은 삭제하지 않는다)
-- ============================================================
CREATE TABLE public.influencer_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  platform text NOT NULL DEFAULT 'instagram',
  username text NOT NULL,
  profile_url text NOT NULL,
  display_name text,
  profile_image_url text,
  bio text,
  followers int,
  reels_avg_views int,
  reels_efficiency numeric,
  engagement_rate numeric,
  reels_ratio numeric,
  last_post_at timestamptz,
  source_category text,
  source_hashtag text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','registered','rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (platform, username)
);

ALTER TABLE public.influencer_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view influencer_candidates"
  ON public.influencer_candidates FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Approved users can create influencer_candidates"
  ON public.influencer_candidates FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());

CREATE POLICY "Approved users can update influencer_candidates"
  ON public.influencer_candidates FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());

-- DELETE 정책 없음: 후보는 물리 삭제하지 않고 status 로만 관리한다.

CREATE INDEX idx_influencer_candidates_status
  ON public.influencer_candidates (status, reels_efficiency DESC);

CREATE INDEX idx_influencer_candidates_username
  ON public.influencer_candidates (platform, username);

-- ============================================================
-- 2. influencer_candidate_cursors (해시태그 로테이션 위치)
-- ============================================================
CREATE TABLE public.influencer_candidate_cursors (
  category text PRIMARY KEY,
  hashtag_index int NOT NULL DEFAULT 0,
  last_run_at timestamptz
);

ALTER TABLE public.influencer_candidate_cursors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view influencer_candidate_cursors"
  ON public.influencer_candidate_cursors FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Approved users can create influencer_candidate_cursors"
  ON public.influencer_candidate_cursors FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user());

CREATE POLICY "Approved users can update influencer_candidate_cursors"
  ON public.influencer_candidate_cursors FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());

-- ============================================================
-- 3. influencer_discovery_runs (하루 실행 횟수 제한 + 비용 감사)
-- ============================================================
CREATE TABLE public.influencer_discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  categories text[] NOT NULL DEFAULT '{}',
  scanned_posts int NOT NULL DEFAULT 0,
  new_candidates int NOT NULL DEFAULT 0,
  detail_fetched int NOT NULL DEFAULT 0,
  run_date date NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Seoul')::DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.influencer_discovery_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view influencer_discovery_runs"
  ON public.influencer_discovery_runs FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Approved users can create influencer_discovery_runs"
  ON public.influencer_discovery_runs FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());

CREATE POLICY "Approved users can update influencer_discovery_runs"
  ON public.influencer_discovery_runs FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());

CREATE INDEX idx_influencer_discovery_runs_date
  ON public.influencer_discovery_runs (run_date, created_by);
