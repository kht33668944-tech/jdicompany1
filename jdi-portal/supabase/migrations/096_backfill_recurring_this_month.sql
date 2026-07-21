-- 096_backfill_recurring_this_month.sql
-- 이번 달(KST) 결제일이 이미 지났거나 오늘인 활성 고정지출 중,
-- 아직 지출내역에 자동 기록되지 않은 건을 "이번 달 결제일" 날짜로 1회 채운다(백필).
--   - 고정지출 등록이 그 달 결제일보다 늦어서 자동 기록이 누락된 경우를 보정.
--   - 말일 초과 billing_day는 그 달 말일로 클램프(process_recurring_expenses와 동일 규칙).
--   - 중복 방지: uq_expenses_recurring_date (recurring_id, expense_date) 부분 유니크 인덱스.
--   - 재실행해도 이미 있는 건은 ON CONFLICT DO NOTHING으로 건너뜀(안전).
-- ============================================================

WITH d AS (
  SELECT
    (NOW() AT TIME ZONE 'Asia/Seoul')::date AS today,
    date_trunc('month', (NOW() AT TIME ZONE 'Asia/Seoul')::date)::date AS month_start,
    EXTRACT(DAY FROM (date_trunc('month', (NOW() AT TIME ZONE 'Asia/Seoul')::date)
                      + interval '1 month - 1 day'))::int AS month_end_day,
    EXTRACT(DAY FROM (NOW() AT TIME ZONE 'Asia/Seoul')::date)::int AS today_day
),
due AS (
  SELECT
    re.*,
    LEAST(re.billing_day, d.month_end_day) AS eff_day,
    d.month_start + (LEAST(re.billing_day, d.month_end_day) - 1) AS bill_date,
    d.today_day
  FROM public.recurring_expenses re
  CROSS JOIN d
  WHERE re.is_active
    AND LEAST(re.billing_day, d.month_end_day) <= d.today_day
)
INSERT INTO public.expenses (
  expense_date, vendor, description, amount_krw, currency, amount_foreign,
  payment_method, category_id, source, recurring_id, created_by
)
SELECT
  due.bill_date, due.vendor, due.name, due.amount_krw, due.currency, due.amount_foreign,
  due.payment_method, due.category_id, 'recurring', due.id, due.created_by
FROM due
ON CONFLICT (recurring_id, expense_date) WHERE recurring_id IS NOT NULL DO NOTHING;
