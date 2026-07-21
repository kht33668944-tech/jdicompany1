-- 092_expenses_hardening.sql
-- 최종 리뷰 반영: 영수증 버킷 민감 차단, 알림 중복 방지, 세금/공과금 분류 분리

-- ============================================================
-- 1) 세금·공과금 분류 분리: 세금(민감) / 공과금(일반), sort_order 명시
-- ============================================================
UPDATE public.expense_categories SET name = '세금', sort_order = 1 WHERE name = '세금·공과금';
INSERT INTO public.expense_categories (name, is_sensitive, sort_order)
VALUES ('공과금', FALSE, 2)
ON CONFLICT (name) DO NOTHING;
UPDATE public.expense_categories SET sort_order = 3 WHERE name = '급여';
UPDATE public.expense_categories SET sort_order = 4 WHERE name = '임차료·관리비';
UPDATE public.expense_categories SET sort_order = 5 WHERE name = '구독·소프트웨어';
UPDATE public.expense_categories SET sort_order = 6 WHERE name = '광고비';
UPDATE public.expense_categories SET sort_order = 7 WHERE name = '물류·배송';
UPDATE public.expense_categories SET sort_order = 8 WHERE name = '비품·소모품';
UPDATE public.expense_categories SET sort_order = 9 WHERE name = '식비·복리후생';

-- ============================================================
-- 2) 영수증 Storage 버킷 정책: 상위 지출 건의 가시성(민감 차단)에 연동
-- ============================================================
DROP POLICY IF EXISTS "Approved read expense-receipts" ON storage.objects;
CREATE POLICY "Approved read expense-receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-receipts' AND public.is_approved_user()
    AND EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id::text = (storage.foldername(name))[1]
        AND public.expense_category_visible(e.category_id)
    )
  );

DROP POLICY IF EXISTS "Approved insert expense-receipts" ON storage.objects;
CREATE POLICY "Approved insert expense-receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts' AND public.is_approved_user()
    AND EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id::text = (storage.foldername(name))[1]
        AND public.expense_category_visible(e.category_id)
    )
  );

DROP POLICY IF EXISTS "Approved delete expense-receipts" ON storage.objects;
CREATE POLICY "Approved delete expense-receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-receipts' AND public.is_approved_user()
    AND EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id::text = (storage.foldername(name))[1]
        AND public.expense_category_visible(e.category_id)
    )
  );

-- ============================================================
-- 3) 고정지출 자동화 함수: 알림 중복 방지(recurring_id + due_date)
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

  -- (b) 내일 결제 예정 알림 (recurring_id + due_date 기준 중복 스킵)
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
      '내일 결제 예정',
      r.name || ' ' ||
        CASE WHEN r.currency = 'USD' AND r.amount_foreign IS NOT NULL
             THEN '$' || trim(to_char(r.amount_foreign, 'FM999,999,990.00'))
             ELSE trim(to_char(r.amount_krw, 'FM999,999,999,990')) || '원'
        END || ' 결제 예정입니다.',
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
