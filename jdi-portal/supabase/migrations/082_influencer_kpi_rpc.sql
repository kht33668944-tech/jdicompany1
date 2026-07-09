-- Aggregate influencer KPI cards in Postgres to avoid transferring every
-- campaign row to the Next.js server for dashboard summary cards.

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
      COALESCE(SUM(cost), 0)::BIGINT AS total_seeding_cost
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
    'total_seeding_cost', cc.total_seeding_cost
  )
  FROM influencer_counts ic
  CROSS JOIN campaign_counts cc
  LEFT JOIN latest_snapshot ls ON true;
$$;

GRANT EXECUTE ON FUNCTION public.get_influencer_kpi_cards() TO authenticated;
