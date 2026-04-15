-- ============================================================
-- 066_developer_role.sql
-- 'developer' 역할 추가: 오류접수 상태 변경 가능, 관리자 기능은 불가
-- ============================================================

-- 1. profiles.role CHECK 제약 갱신
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('employee', 'admin', 'developer'));

-- 2. admin_update_user_role RPC — 새 역할 값 허용
CREATE OR REPLACE FUNCTION admin_update_user_role(
  target_user_id UUID,
  new_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied: only admins can change roles';
  END IF;

  IF new_role NOT IN ('employee', 'admin', 'developer') THEN
    RAISE EXCEPTION 'Invalid role: must be employee, admin, or developer';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;

  UPDATE public.profiles
  SET role = new_role, updated_at = NOW()
  WHERE id = target_user_id;
END;
$$;

-- 3. reports UPDATE 정책 — 개발자도 상태 변경 가능
DROP POLICY IF EXISTS "Authors and admins can update reports" ON public.reports;
CREATE POLICY "Authors, admins, developers can update reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'submitted')
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'developer')
    )
  );
