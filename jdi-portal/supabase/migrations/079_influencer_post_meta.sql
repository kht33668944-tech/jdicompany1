-- 079_influencer_post_meta.sql
-- 인플루언서 게시물 메타데이터 확장: 게시물 유형(이미지/비디오/캐러셀),
-- 릴스 구분(product_type), 조회수, 광고 감지, 해시태그, 캐러셀 자식, 비디오 URL.
-- influencer_posts에 컬럼만 추가 — 기존 RLS 정책(074)이 그대로 적용됨.

ALTER TABLE public.influencer_posts
  ADD COLUMN IF NOT EXISTS post_type        text,
  ADD COLUMN IF NOT EXISTS product_type     text,
  ADD COLUMN IF NOT EXISTS view_count       int,
  ADD COLUMN IF NOT EXISTS is_sponsored     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hashtags         text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS child_thumbnails text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS video_url        text;

-- 유효 값 제약 (NULL 허용 — 기존 데이터 호환)
ALTER TABLE public.influencer_posts
  DROP CONSTRAINT IF EXISTS influencer_posts_post_type_chk;
ALTER TABLE public.influencer_posts
  ADD CONSTRAINT influencer_posts_post_type_chk
  CHECK (post_type IS NULL OR post_type IN ('image','video','carousel'));

ALTER TABLE public.influencer_posts
  DROP CONSTRAINT IF EXISTS influencer_posts_product_type_chk;
ALTER TABLE public.influencer_posts
  ADD CONSTRAINT influencer_posts_product_type_chk
  CHECK (product_type IS NULL OR product_type IN ('feed','clips','igtv'));

-- 필터링 성능용 인덱스 — 갤러리 탭/필터에서 자주 쓰임
CREATE INDEX IF NOT EXISTS idx_influencer_posts_inf_product
  ON public.influencer_posts (influencer_id, product_type);

CREATE INDEX IF NOT EXISTS idx_influencer_posts_inf_sponsored
  ON public.influencer_posts (influencer_id, is_sponsored);
