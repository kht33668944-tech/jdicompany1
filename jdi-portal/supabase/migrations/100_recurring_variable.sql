-- 100_recurring_variable.sql
-- 변동성 고정지출: 금액이 매달 달라지는 항목. 자동 기록 시 금액 미확정(0 + amount_pending)으로 생성.

ALTER TABLE public.recurring_expenses
  ADD COLUMN IF NOT EXISTS is_variable boolean NOT NULL DEFAULT FALSE;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS amount_pending boolean NOT NULL DEFAULT FALSE;

-- 미확정 지출을 빠르게 찾기 위한 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_expenses_amount_pending
  ON public.expenses (expense_date) WHERE amount_pending = TRUE;

-- 자동화 함수 갱신: 변동성 항목은 금액 0 + amount_pending=TRUE 로 생성, 알림 문구 분기
CREATE OR REPLACE FUNCTION public.process_recurring_expenses()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today date := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_tomorrow date := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE + 1;
  r RECORD;
BEGIN
  -- (a) 오늘 결제분 생성 (말일 초과 billing_day 는 그 달 말일로 클램프)
  FOR r IN
    SELECT * FROM public.recurring_expenses re
    WHERE re.is_active
      AND EXTRACT(DAY FROM v_today)::int = LEAST(
        re.billing_day,
        EXTRACT(DAY FROM (date_trunc('month', v_today) + interval '1 month - 1 day'))::int
      )
  LOOP
    INSERT INTO public.expenses (
      expense_date, vendor, description, amount_krw, currency, amount_foreign,
      payment_method, category_id, source, recurring_id, created_by, amount_pending
    ) VALUES (
      v_today, r.vendor, r.name,
      CASE WHEN r.is_variable THEN 0 ELSE r.amount_krw END,
      r.currency,
      CASE WHEN r.is_variable THEN NULL ELSE r.amount_foreign END,
      r.payment_method, r.category_id, 'recurring', r.id, r.created_by,
      r.is_variable  -- 변동성이면 미확정(TRUE)
    )
    ON CONFLICT (recurring_id, expense_date) WHERE recurring_id IS NOT NULL DO NOTHING;
  END LOOP;

  -- (b) 내일 결제 예정 알림 (recurring_id + due_date 중복 스킵)
  FOR r IN
    SELECT * FROM public.recurring_expenses re
    WHERE re.is_active
      AND EXTRACT(DAY FROM v_tomorrow)::int = LEAST(
        re.billing_day,
        EXTRACT(DAY FROM (date_trunc('month', v_tomorrow) + interval '1 month - 1 day'))::int
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
    SELECT
      r.owner_id,
      'expense_due',
      CASE WHEN r.is_variable THEN '내일 결제 · 금액 입력 필요' ELSE '내일 결제 예정' END,
      CASE
        WHEN r.is_variable THEN r.name || ' 이번 달 금액을 입력해주세요.'
        WHEN r.currency = 'USD' AND r.amount_foreign IS NOT NULL
          THEN r.name || ' $' || trim(to_char(r.amount_foreign, 'FM999,999,990.00')) || ' 결제 예정입니다.'
        ELSE r.name || ' ' || trim(to_char(r.amount_krw, 'FM999,999,999,990')) || '원 결제 예정입니다.'
      END,
      '/dashboard/expenses',
      jsonb_build_object('recurring_id', r.id, 'due_date', v_tomorrow)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.type = 'expense_due'
        AND n.metadata->>'recurring_id' = r.id::text
        AND n.metadata->>'due_date' = v_tomorrow::text
    );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.process_recurring_expenses() FROM PUBLIC;
