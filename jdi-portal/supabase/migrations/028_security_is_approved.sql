-- 028_security_is_approved.sql
-- 보안 강화: 승인되지 않은 사용자 데이터 접근 차단 + 자가 승인 방지

-- ============================================================
-- 헬퍼 함수: 현재 사용자가 승인된 상태인지 확인
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_approved_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_approved = TRUE
  );
$$;

-- ============================================================
-- 1. tasks 테이블 RLS 강화
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can view" ON public.tasks;
CREATE POLICY "Approved users can view tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (public.is_approved_user());

DROP POLICY IF EXISTS "Authenticated can create" ON public.tasks;
CREATE POLICY "Approved users can create tasks"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());

-- ============================================================
-- 2. attendance_records 테이블 RLS 강화
-- ============================================================
DROP POLICY IF EXISTS "Users can view own attendance" ON public.attendance_records;
CREATE POLICY "Approved users can view own attendance"
  ON public.attendance_records FOR SELECT TO authenticated
  USING (public.is_approved_user() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all attendance" ON public.attendance_records;
CREATE POLICY "Approved admins can view all attendance"
  ON public.attendance_records FOR SELECT TO authenticated
  USING (
    public.is_approved_user() AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Users can manage own attendance" ON public.attendance_records;
CREATE POLICY "Approved users can manage own attendance"
  ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own attendance" ON public.attendance_records;
CREATE POLICY "Approved users can update own attendance"
  ON public.attendance_records FOR UPDATE TO authenticated
  USING (public.is_approved_user() AND user_id = auth.uid());

-- ============================================================
-- 3. reports 테이블 RLS 강화
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can view reports" ON public.reports;
CREATE POLICY "Approved users can view reports"
  ON public.reports FOR SELECT TO authenticated
  USING (public.is_approved_user());

DROP POLICY IF EXISTS "Users can insert own reports" ON public.reports;
CREATE POLICY "Approved users can insert own reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND user_id = auth.uid());

-- ============================================================
-- 4. profiles UPDATE 정책 강화: is_approved 자가 변경 차단
-- ============================================================
DROP POLICY IF EXISTS "Users can update own profile (no role change)" ON public.profiles;
CREATE POLICY "Users can update own profile (restricted)"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND is_approved = (SELECT is_approved FROM public.profiles WHERE id = auth.uid())
  );
