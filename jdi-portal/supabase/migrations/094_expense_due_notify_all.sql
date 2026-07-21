-- ============================================================
-- 094: 고정지출 "내일 결제 예정" 알림 대상 확장
--   기존: 담당자(owner) 1명에게만 발송
--   변경: 승인된 사용자 중 지출 알림(expense_notify)을 켠 모든 사용자에게 발송
--   - (a) 오늘 결제분 자동 생성 블록은 092와 동일(변경 없음)
--   - (b) 알림 블록만 fan-out + user별 중복 스킵(recurring_id + due_date + user_id)
--   - push-dispatch는 이미 expense_due → expense_notify + push_enabled로 필터하므로
--     알림을 끈 사용자에게는 웹푸시가 가지 않는다.
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

  -- (b) 내일 결제 예정 알림 → 승인 + 지출 알림 켠 모든 사용자
  --     (recurring_id + due_date + user_id 기준 중복 스킵)
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
      p.id,
      'expense_due',
      '내일 결제 예정',
      r.name || ' ' ||
        CASE WHEN r.currency = 'USD' AND r.amount_foreign IS NOT NULL
             THEN '$' || trim(to_char(r.amount_foreign, 'FM999,999,990.00'))
             ELSE trim(to_char(r.amount_krw, 'FM999,999,999,990')) || '원'
        END || ' 결제 예정입니다.',
      '/dashboard/expenses',
      jsonb_build_object('recurring_id', r.id, 'due_date', v_tomorrow)
    FROM public.profiles p
    LEFT JOIN public.notification_settings ns ON ns.user_id = p.id
    WHERE p.is_approved = true
      AND COALESCE(ns.expense_notify, true) = true
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.type = 'expense_due'
          AND n.user_id = p.id
          AND n.metadata->>'recurring_id' = r.id::text
          AND n.metadata->>'due_date' = v_tomorrow::text
      );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.process_recurring_expenses() FROM PUBLIC;
