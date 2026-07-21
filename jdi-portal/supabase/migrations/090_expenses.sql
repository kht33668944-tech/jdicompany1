-- 090_expenses.sql
-- 지출 관리 도메인: 분류/지출/고정지출 + RLS + 민감 열람 권한 + 영수증 버킷 + 고정지출 자동화(pg_cron)

-- ============================================================
-- 1) profiles: 민감 지출 열람 권한
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_view_sensitive_expenses BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.can_view_sensitive_expenses()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_approved = TRUE AND can_view_sensitive_expenses = TRUE
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_sensitive_expenses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_sensitive_expenses() TO authenticated;

-- ============================================================
-- 2) 분류 테이블
-- ============================================================
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_sensitive boolean NOT NULL DEFAULT FALSE,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view expense categories"
  ON public.expense_categories FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Admins can manage expense categories"
  ON public.expense_categories FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

INSERT INTO public.expense_categories (name, is_sensitive, sort_order) VALUES
  ('세금·공과금', TRUE, 1),
  ('급여', TRUE, 2),
  ('임차료·관리비', FALSE, 3),
  ('구독·소프트웨어', FALSE, 4),
  ('광고비', FALSE, 5),
  ('물류·배송', FALSE, 6),
  ('비품·소모품', FALSE, 7),
  ('식비·복리후생', FALSE, 8),
  ('기타', FALSE, 99)
ON CONFLICT (name) DO NOTHING;

-- 분류 가시성 헬퍼: 민감 분류가 아니거나, 열람 권한 보유
CREATE OR REPLACE FUNCTION public.expense_category_visible(p_category_id uuid)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.can_view_sensitive_expenses()
      OR NOT EXISTS (
        SELECT 1 FROM public.expense_categories c
        WHERE c.id = p_category_id AND c.is_sensitive = TRUE
      );
$$;
REVOKE ALL ON FUNCTION public.expense_category_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expense_category_visible(uuid) TO authenticated;

-- ============================================================
-- 3) 고정 지출 테이블
-- ============================================================
CREATE TABLE public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vendor text,
  amount_krw bigint NOT NULL CHECK (amount_krw >= 0),
  currency text NOT NULL DEFAULT 'KRW' CHECK (currency IN ('KRW', 'USD')),
  amount_foreign numeric CHECK (amount_foreign IS NULL OR amount_foreign >= 0),
  billing_day smallint NOT NULL CHECK (billing_day BETWEEN 1 AND 31),
  payment_method text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.expense_categories(id),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL DEFAULT TRUE,
  note text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view recurring expenses"
  ON public.recurring_expenses FOR SELECT TO authenticated
  USING (public.is_approved_user() AND public.expense_category_visible(category_id));

CREATE POLICY "Approved users can create recurring expenses"
  ON public.recurring_expenses FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid()
              AND public.expense_category_visible(category_id));

CREATE POLICY "Approved users can update recurring expenses"
  ON public.recurring_expenses FOR UPDATE TO authenticated
  USING (public.is_approved_user() AND public.expense_category_visible(category_id))
  WITH CHECK (public.is_approved_user() AND public.expense_category_visible(category_id));

CREATE POLICY "Approved users can delete recurring expenses"
  ON public.recurring_expenses FOR DELETE TO authenticated
  USING (public.is_approved_user() AND public.expense_category_visible(category_id));

-- ============================================================
-- 4) 지출 테이블
-- ============================================================
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL,
  vendor text,
  description text NOT NULL,
  amount_krw bigint NOT NULL CHECK (amount_krw >= 0),
  currency text NOT NULL DEFAULT 'KRW' CHECK (currency IN ('KRW', 'USD')),
  amount_foreign numeric CHECK (amount_foreign IS NULL OR amount_foreign >= 0),
  payment_method text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.expense_categories(id),
  receipt_path text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'recurring', 'import')),
  recurring_id uuid REFERENCES public.recurring_expenses(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view expenses"
  ON public.expenses FOR SELECT TO authenticated
  USING (public.is_approved_user() AND public.expense_category_visible(category_id));

CREATE POLICY "Approved users can create expenses"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid()
              AND public.expense_category_visible(category_id));

CREATE POLICY "Approved users can update expenses"
  ON public.expenses FOR UPDATE TO authenticated
  USING (public.is_approved_user() AND public.expense_category_visible(category_id))
  WITH CHECK (public.is_approved_user() AND public.expense_category_visible(category_id));

CREATE POLICY "Approved users can delete expenses"
  ON public.expenses FOR DELETE TO authenticated
  USING (public.is_approved_user() AND public.expense_category_visible(category_id));

-- 고정지출 중복 생성 방지 + 조회 인덱스
CREATE UNIQUE INDEX uq_expenses_recurring_date
  ON public.expenses (recurring_id, expense_date) WHERE recurring_id IS NOT NULL;
CREATE INDEX idx_expenses_date ON public.expenses (expense_date DESC);
CREATE INDEX idx_expenses_category ON public.expenses (category_id);

-- ============================================================
-- 5) 관리자용 민감 열람 권한 토글 RPC (066 패턴)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_expense_sensitive_access(
  target_user_id UUID,
  allowed BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied: only admins can change expense access';
  END IF;

  UPDATE public.profiles
  SET can_view_sensitive_expenses = allowed, updated_at = NOW()
  WHERE id = target_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_expense_sensitive_access(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_expense_sensitive_access(UUID, BOOLEAN) TO authenticated;

-- ============================================================
-- 6) 영수증 Storage 버킷 (비공개, 080 패턴)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts',
  'expense-receipts',
  FALSE,
  10 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Approved read expense-receipts" ON storage.objects;
CREATE POLICY "Approved read expense-receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts' AND public.is_approved_user());

DROP POLICY IF EXISTS "Approved insert expense-receipts" ON storage.objects;
CREATE POLICY "Approved insert expense-receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts' AND public.is_approved_user());

DROP POLICY IF EXISTS "Approved delete expense-receipts" ON storage.objects;
CREATE POLICY "Approved delete expense-receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts' AND public.is_approved_user());

-- ============================================================
-- 7) 알림 설정 컬럼 (push-dispatch 필터용)
-- ============================================================
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS expense_notify BOOLEAN NOT NULL DEFAULT TRUE;

-- ============================================================
-- 8) 고정지출 자동화: 매일 09:00 KST(= 00:00 UTC)
--    (a) 오늘이 결제일인 활성 고정지출 → expenses 자동 생성
--    (b) 내일이 결제일 → 담당자에게 expense_due 알림
--    SECURITY DEFINER(postgres 소유)라 notifications 직접 INSERT 가능
--    (INSERT가 Database Webhook을 거쳐 push-dispatch로 웹푸시 발송됨)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

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
             THEN '$' || trim(to_char(r.amount_foreign, 'FM999,999,990.##'))
             ELSE trim(to_char(r.amount_krw, 'FM999,999,999,990')) || '원'
        END || ' 결제 예정입니다.',
      '/dashboard/expenses'
    );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.process_recurring_expenses() FROM PUBLIC;

-- 09:00 KST = 00:00 UTC
SELECT cron.schedule(
  'daily_recurring_expenses',
  '0 0 * * *',
  $$ SELECT public.process_recurring_expenses(); $$
);
