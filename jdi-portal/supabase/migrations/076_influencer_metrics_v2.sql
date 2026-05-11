-- 076_influencer_metrics_v2.sql
-- 예상 도달 공식 v2: 팔로워 사이즈별 organic reach rate 적용
--
-- 배경:
--   기존 SUM(follower * ER * 0.003)는 ER이 낮은 인플루언서의 도달을
--   심하게 과소평가했음 (예: 10만 팔로워+ER 1% → 300명).
--
-- 변경:
--   2025년 인스타 organic reach 벤치마크 기반 사이즈별 reach rate 적용:
--     ~1만:        10%
--     1만~5만:      7%
--     5만~50만:     5%
--     50만~100만:   4%
--     100만+:       3.5%

-- ============================================================
-- 1. 팔로워 사이즈별 reach rate 헬퍼 함수
-- ============================================================
CREATE OR REPLACE FUNCTION public.influencer_reach_rate(p_follower_count bigint)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_follower_count IS NULL OR p_follower_count <= 0 THEN 0
    WHEN p_follower_count < 10000   THEN 0.10
    WHEN p_follower_count < 50000   THEN 0.07
    WHEN p_follower_count < 500000  THEN 0.05
    WHEN p_follower_count < 1000000 THEN 0.04
    ELSE 0.035
  END::numeric;
$$;

-- ============================================================
-- 2. KPI 스냅샷 함수 — 새 도달 공식 적용
-- ============================================================
CREATE OR REPLACE FUNCTION public.snapshot_influencer_kpi()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date date := (NOW() AT TIME ZONE 'Asia/Seoul')::date;
  v_total int;
  v_avg_er numeric;
  v_reach bigint;
  v_progress numeric;
BEGIN
  -- 활성 인플루언서 수 + 평균 ER
  SELECT COUNT(*), AVG(engagement_rate)
    INTO v_total, v_avg_er
    FROM public.influencers
    WHERE status = 'active';

  -- 예상 도달 v2: SUM(follower * 사이즈별 reach rate)
  SELECT COALESCE(
    SUM(follower_count * public.influencer_reach_rate(follower_count))::bigint,
    0
  )
    INTO v_reach
    FROM public.influencers
    WHERE status = 'active'
      AND follower_count IS NOT NULL;

  -- 시딩 진행률: shipped/posted/done 비율
  SELECT COALESCE(
    100.0 * COUNT(*) FILTER (WHERE status IN ('shipped', 'posted', 'done'))
      / NULLIF(COUNT(*), 0),
    0
  )::numeric
    INTO v_progress
    FROM public.influencer_campaigns;

  INSERT INTO public.influencer_kpi_weekly_snapshots
    (snapshot_date, total_count, avg_engagement_rate, estimated_reach, campaign_progress_rate)
    VALUES (v_date, v_total, v_avg_er, v_reach, v_progress)
    ON CONFLICT (snapshot_date) DO UPDATE SET
      total_count            = EXCLUDED.total_count,
      avg_engagement_rate    = EXCLUDED.avg_engagement_rate,
      estimated_reach        = EXCLUDED.estimated_reach,
      campaign_progress_rate = EXCLUDED.campaign_progress_rate;
END;
$$;
