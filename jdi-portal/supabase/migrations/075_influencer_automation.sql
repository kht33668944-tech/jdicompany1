-- 075_influencer_automation.sql
-- 인플루언서 주간 자동화: KPI 스냅샷 함수 + pg_cron 등록 + 재크롤링 트리거 함수

-- ============================================================
-- 0. 필수 Extension 활성화
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- 1. KPI 스냅샷 함수
-- 매주 일요일 23:55 KST (= UTC 14:55 일요일)에 cron으로 호출
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

  -- 예상 도달: SUM(follower_count * engagement_rate * 0.003)
  SELECT COALESCE(SUM(follower_count * engagement_rate * 0.003)::bigint, 0)
    INTO v_reach
    FROM public.influencers
    WHERE status = 'active'
      AND engagement_rate IS NOT NULL
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

-- ============================================================
-- 2. 재크롤링 트리거 함수 (pg_net 사용)
-- 활성 인플루언서 전체를 influencer-extract Edge Function에 POST
--
-- 사용 전 필수 셋업 (Supabase Dashboard SQL Editor에서 한 번 실행):
--   SELECT vault.create_secret('<service_role_jwt>', 'app.webhook_secret');
--   ALTER DATABASE postgres SET app.supabase_url = 'https://<project>.supabase.co';
--   -- 또는:
--   SELECT vault.create_secret('https://<project>.supabase.co', 'app.supabase_url');
--
-- 셋업 완료 후 cron 등록 (매주 월요일 03:00 KST = UTC 일요일 18:00):
--   SELECT cron.schedule(
--     'weekly_resync_influencers',
--     '0 18 * * 0',
--     $$ SELECT public.weekly_resync_influencers(); $$
--   );
-- ============================================================
CREATE OR REPLACE FUNCTION public.weekly_resync_influencers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_url    text := current_setting('app.supabase_url', true);
  v_secret text := current_setting('app.webhook_secret', true);
BEGIN
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'weekly_resync_influencers: app.supabase_url 또는 app.webhook_secret GUC가 설정되지 않았습니다. 셋업 후 재실행하세요.';
    RETURN;
  END IF;

  FOR r IN
    SELECT id, profile_url, created_by
      FROM public.influencers
      WHERE status = 'active'
  LOOP
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/influencer-extract',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_secret,
        'Content-Type',  'application/json'
      ),
      body    := jsonb_build_object(
        'profile_url', r.profile_url,
        'created_by',  r.created_by
      )
    );
  END LOOP;
END;
$$;

-- ============================================================
-- 3. KPI 스냅샷 cron 등록
-- 매주 일요일 23:55 KST = UTC 14:55 (일요일, 요일=0)
-- ============================================================
SELECT cron.schedule(
  'weekly_kpi_snapshot',
  '55 14 * * 0',
  $$ SELECT public.snapshot_influencer_kpi(); $$
);

-- 재크롤링 cron은 vault/GUC 셋업 후 별도 등록 (위 주석 참조)
