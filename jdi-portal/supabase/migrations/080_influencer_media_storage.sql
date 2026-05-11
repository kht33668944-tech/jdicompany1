-- 080_influencer_media_storage.sql
-- 인플루언서 미디어(프로필/썸네일) 자체 저장 인프라
--   1) Storage 버킷 'influencer-media' 생성 (public read)
--   2) influencers / influencer_posts에 storage path 컬럼 추가 (기존 *_url 컬럼은 유지 — fallback용)
--
-- 적용 영향: 0 — 기존 코드는 그대로 동작 (새 컬럼 NULL일 때 *_url 사용).

-- ============================================================
-- 1. Storage 버킷
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'influencer-media',
  'influencer-media',
  TRUE,             -- public read — Next/Image에서 직접 fetch
  10 * 1024 * 1024, -- 10MB 상한 (인스타 원본도 보통 1MB 미만)
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Storage RLS — 읽기 공개, 쓰기는 service_role만 (Edge Function 전용)
-- ============================================================
DROP POLICY IF EXISTS "Public read influencer-media" ON storage.objects;
CREATE POLICY "Public read influencer-media"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'influencer-media');

-- INSERT/UPDATE/DELETE: 일반 authenticated 사용자 차단
--   → Edge Function이 service_role_key로 우회 (RLS bypass)
DROP POLICY IF EXISTS "Block direct write influencer-media" ON storage.objects;
CREATE POLICY "Block direct write influencer-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'influencer-media');

-- ============================================================
-- 3. influencers — 프로필 이미지 path
-- ============================================================
ALTER TABLE public.influencers
  ADD COLUMN IF NOT EXISTS profile_image_path text;

COMMENT ON COLUMN public.influencers.profile_image_path IS
  'Supabase Storage 경로 (예: profiles/{influencer_id}.jpg). NULL이면 profile_image_url(인스타 CDN) fallback.';

-- ============================================================
-- 4. influencer_posts — 썸네일 path + 자식 썸네일 paths
-- ============================================================
ALTER TABLE public.influencer_posts
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS child_thumbnail_paths text[] DEFAULT '{}';

COMMENT ON COLUMN public.influencer_posts.thumbnail_path IS
  'Supabase Storage 경로 (예: posts/{post_id}/thumb.jpg). NULL이면 thumbnail_url fallback.';

COMMENT ON COLUMN public.influencer_posts.child_thumbnail_paths IS
  'Storage 경로 배열 (carousel 자식들). 빈 배열이면 child_thumbnails(URL) fallback.';

-- ============================================================
-- 5. 백그라운드 작업 큐 (미디어 다운로드 대기 목록)
--   Edge Function의 EdgeRuntime.waitUntil이 실패해도 재시도 가능하도록 큐로 관리
-- ============================================================
CREATE TABLE IF NOT EXISTS public.influencer_media_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id uuid NOT NULL REFERENCES public.influencers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  attempts int NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.influencer_media_jobs ENABLE ROW LEVEL SECURITY;

-- service_role(Edge Function)만 INSERT/UPDATE — 일반 사용자는 SELECT만
CREATE POLICY "Approved users can view influencer_media_jobs"
  ON public.influencer_media_jobs FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Block direct insert to influencer_media_jobs"
  ON public.influencer_media_jobs FOR INSERT TO authenticated
  WITH CHECK (FALSE);

CREATE POLICY "Block direct update to influencer_media_jobs"
  ON public.influencer_media_jobs FOR UPDATE TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

CREATE POLICY "Approved users can delete influencer_media_jobs"
  ON public.influencer_media_jobs FOR DELETE TO authenticated
  USING (public.is_approved_user());

CREATE INDEX IF NOT EXISTS idx_influencer_media_jobs_status
  ON public.influencer_media_jobs (status, created_at);
