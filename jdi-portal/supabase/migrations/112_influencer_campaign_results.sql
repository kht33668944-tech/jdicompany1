-- 112_influencer_campaign_results.sql
-- 시딩 성과: 이미 influencer_posts 에 쌓인 좋아요/댓글/조회수를 캠페인에 연결한다.
--
-- 배경: influencer-extract 가 프로필을 훑으며 게시물 수치를 이미 저장하고 있는데,
--       캠페인에는 post_url 문자열만 있어 성과를 손으로 정리해야 했다.
--       새 외부 수집 없이 연결만 하면 된다.

-- ============================================================
-- 1) 성과 스냅샷 컬럼
--    게시물이 "최근 게시물" 목록에서 밀려나면 influencer_posts 에서 사라지므로
--    수치를 캠페인 행에 복사해 보관한다. 이것이 이 마이그레이션의 핵심이다.
-- ============================================================
ALTER TABLE public.influencer_campaigns
  ADD COLUMN IF NOT EXISTS result_likes int,
  ADD COLUMN IF NOT EXISTS result_comments int,
  ADD COLUMN IF NOT EXISTS result_views int,
  ADD COLUMN IF NOT EXISTS result_captured_at timestamptz;

-- ============================================================
-- 2) 게시물 주소 정규화
--    ⚠️ src/lib/influencer/url.ts 의 normalizePostUrl() 과 동기 유지.
--    규칙: 앞뒤 공백 제거 → 쿼리·해시 제거 → www. 제거 → 스킴+호스트 소문자
--          → 끝 슬래시 제거. 주소 형식이 아니면 NULL.
-- ============================================================
CREATE OR REPLACE FUNCTION public.normalize_post_url(p_url text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  WITH cleaned AS (
    SELECT regexp_replace(
             regexp_replace(btrim(COALESCE(p_url, '')), '[?#].*$', ''),
             '^(https?://)www\.', '\1', 'i'
           ) AS v
  )
  SELECT CASE
    WHEN v = '' OR v !~* '^https?://' THEN NULL
    ELSE lower(substring(v FROM '^https?://[^/]*'))
         || regexp_replace(COALESCE(substring(v FROM '^https?://[^/]*(/.*)$'), ''), '/+$', '')
  END
  FROM cleaned;
$$;

-- 시딩 게시물 매칭용 인덱스
CREATE INDEX IF NOT EXISTS idx_influencer_posts_normalized_url
  ON public.influencer_posts (influencer_id, public.normalize_post_url(post_url));

-- ============================================================
-- 3) 성과 복사 (수동 갱신 — 버튼을 누를 때만 실행된다)
--    매칭에 실패하면 기존 값을 지우지 않고 아무것도 반환하지 않는다.
--    권한 상승이 필요 없으므로 SECURITY INVOKER(기본) — RLS 가 그대로 적용된다.
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_campaign_result(p_campaign_id uuid)
RETURNS TABLE (likes int, comments int, views int)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_camp record;
  v_post record;
BEGIN
  SELECT c.id, c.influencer_id, c.post_url
    INTO v_camp
    FROM public.influencer_campaigns c
   WHERE c.id = p_campaign_id;

  IF NOT FOUND OR v_camp.post_url IS NULL THEN
    RETURN;
  END IF;

  SELECT p.likes, p.comments, p.view_count
    INTO v_post
    FROM public.influencer_posts p
   WHERE p.influencer_id = v_camp.influencer_id
     AND public.normalize_post_url(p.post_url) = public.normalize_post_url(v_camp.post_url)
   LIMIT 1;

  -- 게시물이 최근 목록에서 밀려났으면 기존 수치를 그대로 둔다.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.influencer_campaigns
     SET result_likes       = v_post.likes,
         result_comments    = v_post.comments,
         result_views       = v_post.view_count,
         result_captured_at = now()
   WHERE id = p_campaign_id;

  likes := v_post.likes;
  comments := v_post.comments;
  views := v_post.view_count;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_campaign_result(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_campaign_result(uuid) TO authenticated;

-- ============================================================
-- 4) KPI 카드 확장
--    기존 필드는 그대로 두고 성과 합계만 더한다(화면 호환).
--    단일 RPC 왕복 구조를 유지한다 — 성능 불변조건.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_influencer_kpi_cards()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH influencer_counts AS (
    SELECT COUNT(*)::INT AS active_count
      FROM public.influencers
     WHERE status = 'active'
  ),
  campaign_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE status <> 'done')::INT AS active_campaign_count,
      COUNT(*) FILTER (WHERE status = 'done')::INT AS done_campaign_count,
      COALESCE(SUM(cost), 0)::BIGINT AS total_seeding_cost,
      COALESCE(SUM(result_views), 0)::BIGINT AS total_result_views,
      COALESCE(SUM(result_likes), 0)::BIGINT AS total_result_likes,
      COALESCE(SUM(result_comments), 0)::BIGINT AS total_result_comments
    FROM public.influencer_campaigns
  ),
  latest_snapshot AS (
    SELECT total_count
      FROM public.influencer_kpi_weekly_snapshots
     ORDER BY snapshot_date DESC
     LIMIT 1
  )
  SELECT jsonb_build_object(
    'total_count', ic.active_count,
    'prev_total_count', ls.total_count,
    'active_campaign_count', cc.active_campaign_count,
    'done_campaign_count', cc.done_campaign_count,
    'total_seeding_cost', cc.total_seeding_cost,
    'total_result_views', cc.total_result_views,
    'total_result_likes', cc.total_result_likes,
    'total_result_comments', cc.total_result_comments,
    'cost_per_10k_views',
      CASE WHEN cc.total_result_views > 0
           THEN ROUND(cc.total_seeding_cost / (cc.total_result_views / 10000.0))
           ELSE NULL END
  )
  FROM influencer_counts ic
  CROSS JOIN campaign_counts cc
  LEFT JOIN latest_snapshot ls ON true;
$$;

GRANT EXECUTE ON FUNCTION public.get_influencer_kpi_cards() TO authenticated;

-- ============================================================
-- 5) 인플루언서별 자사 실적
--    팔로워 기반 등급과 별개로, 우리와 실제로 낸 성과를 본다.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_influencer_seeding_history(p_influencer_id uuid)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'campaign_count', COUNT(*)::INT,
    'done_count', COUNT(*) FILTER (WHERE status = 'done')::INT,
    'total_cost', COALESCE(SUM(cost), 0)::BIGINT,
    'total_views', COALESCE(SUM(result_views), 0)::BIGINT,
    'total_likes', COALESCE(SUM(result_likes), 0)::BIGINT,
    'total_comments', COALESCE(SUM(result_comments), 0)::BIGINT,
    'avg_views', ROUND(AVG(result_views) FILTER (WHERE result_views IS NOT NULL)),
    'cost_per_10k_views',
      CASE WHEN COALESCE(SUM(result_views), 0) > 0
           THEN ROUND(COALESCE(SUM(cost), 0) / (SUM(result_views) / 10000.0))
           ELSE NULL END
  )
  FROM public.influencer_campaigns
  WHERE influencer_id = p_influencer_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_influencer_seeding_history(uuid) TO authenticated;
