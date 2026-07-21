-- 091_expenses_fixes.sql
-- 090 리뷰 반영: USD 알림 금액 포맷 수정, 분류 관리자 정책에 승인 조건 추가

-- ============================================================
-- 1) 분류 관리자 정책: is_approved_user() 조건 추가
-- ============================================================
DROP POLICY IF EXISTS "Admins can manage expense categories" ON public.expense_categories;
CREATE POLICY "Admins can manage expense categories"
  ON public.expense_categories FOR ALL TO authenticated
  USING (public.is_approved_user()
         AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (public.is_approved_user()
              AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 2) 고정지출 자동화 함수: USD 알림 금액 포맷 수정 ('.##' → '.00')
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_recurring_expenses()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today date := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_tomorrow date := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE + 1;
  r RECORD;
BEGIN
  -- (a) 오늘 결제분 생성 (말일 초과 billing_day는 그 달 말일로 클램프)
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
      payment_method, category_id, source, recurring_id, created_by
    ) VALUES (
      v_today, r.vendor, r.name, r.amount_krw, r.currency, r.amount_foreign,
      r.payment_method, r.category_id, 'recurring', r.id, r.created_by
    )
    ON CONFLICT (recurring_id, expense_date) WHERE recurring_id IS NOT NULL DO NOTHING;
  END LOOP;

  -- (b) 내일 결제 예정 알림
  FOR r IN
    SELECT * FROM public.recurring_expenses re
    WHERE re.is_active
      AND EXTRACT(DAY FROM v_tomorrow)::int = LEAST(
        re.billing_day,
        EXTRACT(DAY FROM (date_trunc('month', v_tomorrow) + interval '1 month - 1 day'))::int
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      r.owner_id,
      'expense_due',
      '내일 결제 예정',
      r.name || ' ' ||
        CASE WHEN r.currency = 'USD' AND r.amount_foreign IS NOT NULL
             THEN '$' || trim(to_char(r.amount_foreign, 'FM999,999,990.00'))
             ELSE trim(to_char(r.amount_krw, 'FM999,999,999,990')) || '원'
        END || ' 결제 예정입니다.',
      '/dashboard/expenses'
    );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.process_recurring_expenses() FROM PUBLIC;
