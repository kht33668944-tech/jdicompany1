-- 097_expense_categories_user_manage.sql
-- 분류(expense_categories)를 결제수단(093)처럼 승인된 직원 누구나 추가/숨김 할 수 있게 완화.
-- 단, 민감 분류(세금·급여)는 계속 관리자만 다룰 수 있게 방어한다.
--   - 일반 직원은 is_sensitive = FALSE 인 분류만 생성/수정 가능
--   - 민감 분류로의 승격(is_sensitive = TRUE)은 WITH CHECK 로 차단
--   - 삭제는 하드 삭제 대신 소프트 삭제(is_active = FALSE)로 처리해 기존 지출의 category_id 참조를 보존
--     (하드 DELETE 는 기존 "Admins can manage" 정책으로 관리자만 가능하게 유지)

-- 누가 추가했는지 추적 (결제수단 테이블과 동일한 패턴)
ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);

-- 승인 직원: 비민감 분류 생성 (본인 명의로만)
DROP POLICY IF EXISTS "Approved users can create non-sensitive categories" ON public.expense_categories;
CREATE POLICY "Approved users can create non-sensitive categories"
  ON public.expense_categories FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user()
    AND is_sensitive = FALSE
    AND created_by = auth.uid()
  );

-- 승인 직원: 비민감 분류 수정 (소프트 삭제 = is_active 토글, 이름 변경 등)
-- USING 으로 "현재 비민감" 인 행만 대상, WITH CHECK 로 민감 분류 승격 차단
DROP POLICY IF EXISTS "Approved users can update non-sensitive categories" ON public.expense_categories;
CREATE POLICY "Approved users can update non-sensitive categories"
  ON public.expense_categories FOR UPDATE TO authenticated
  USING (public.is_approved_user() AND is_sensitive = FALSE)
  WITH CHECK (public.is_approved_user() AND is_sensitive = FALSE);

-- 참고: "Admins can manage expense categories" (091) ALL 정책은 그대로 유지되어
--       관리자는 민감 분류 생성/수정/하드삭제까지 전부 가능하다.
