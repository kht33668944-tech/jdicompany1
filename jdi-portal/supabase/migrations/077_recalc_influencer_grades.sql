-- 077_recalc_influencer_grades.sql
-- 사이즈별 ER 등급 공식 (Edge Function influencer-extract와 동일)을 SQL 함수로 정의
-- + 기존 인플루언서 전체에 새 공식 일괄 적용

-- ============================================================
-- 1. 사이즈별 등급 계산 함수
-- ============================================================
CREATE OR REPLACE FUNCTION public.influencer_grade(
  p_engagement_rate numeric,
  p_follower_count  bigint
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_engagement_rate IS NULL OR p_follower_count IS NULL THEN 'UNRATED'
    -- 나노 (~1만)
    WHEN p_follower_count < 10000 THEN
      CASE WHEN p_engagement_rate >= 6   THEN 'S'
           WHEN p_engagement_rate >= 3   THEN 'A'
           WHEN p_engagement_rate >= 1   THEN 'B'
           ELSE 'C' END
    -- 마이크로 (1만~5만)
    WHEN p_follower_count < 50000 THEN
      CASE WHEN p_engagement_rate >= 4   THEN 'S'
           WHEN p_engagement_rate >= 2   THEN 'A'
           WHEN p_engagement_rate >= 0.8 THEN 'B'
           ELSE 'C' END
    -- 미드 (5만~50만)
    WHEN p_follower_count < 500000 THEN
      CASE WHEN p_engagement_rate >= 2.5 THEN 'S'
           WHEN p_engagement_rate >= 1.5 THEN 'A'
           WHEN p_engagement_rate >= 0.5 THEN 'B'
           ELSE 'C' END
    -- 매크로 (50만~100만)
    WHEN p_follower_count < 1000000 THEN
      CASE WHEN p_engagement_rate >= 1.5 THEN 'S'
           WHEN p_engagement_rate >= 0.8 THEN 'A'
           WHEN p_engagement_rate >= 0.3 THEN 'B'
           ELSE 'C' END
    -- 메가 (100만+)
    ELSE
      CASE WHEN p_engagement_rate >= 1.0 THEN 'S'
           WHEN p_engagement_rate >= 0.5 THEN 'A'
           WHEN p_engagement_rate >= 0.2 THEN 'B'
           ELSE 'C' END
  END;
$$;

-- ============================================================
-- 2. 기존 인플루언서 등급 일괄 갱신
-- ============================================================
UPDATE public.influencers
SET grade = public.influencer_grade(engagement_rate, follower_count::bigint),
    updated_at = NOW();
