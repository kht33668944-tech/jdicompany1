-- 093_payment_methods.sql
-- 결제수단 공용 목록: 지출 입력 시 드롭다운에서 선택/추가/삭제 (직원 누구나)

CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 100,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view payment methods"
  ON public.payment_methods FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Approved users can create payment methods"
  ON public.payment_methods FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());

CREATE POLICY "Approved users can delete payment methods"
  ON public.payment_methods FOR DELETE TO authenticated
  USING (public.is_approved_user());

-- 기본 결제수단 시드
INSERT INTO public.payment_methods (name, sort_order) VALUES
  ('기업은행 법인계좌이체', 1),
  ('기업은행 법인카드', 2),
  ('신한 광고비카드', 3),
  ('법인카드', 4)
ON CONFLICT (name) DO NOTHING;

-- 기존 지출에 이미 쓰인 결제수단도 목록에 편입해 유실 방지
INSERT INTO public.payment_methods (name, sort_order)
SELECT DISTINCT trim(payment_method), 100
FROM public.expenses
WHERE payment_method IS NOT NULL AND trim(payment_method) <> ''
ON CONFLICT (name) DO NOTHING;
