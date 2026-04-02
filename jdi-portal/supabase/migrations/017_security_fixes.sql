-- 017: 보안 수정 — role 변경 권한 제어
-- 문제: 사용자가 직접 profiles.role을 변경하여 admin 권한 상승 가능
-- 해결: RLS에서 role 변경 차단 + admin 전용 RPC 함수 생성

-- ============================================================
-- 1. 기존 UPDATE 정책 교체: role 컬럼 변경 차단
-- ============================================================
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- 자기 프로필 업데이트 허용하되, role 변경은 차단
CREATE POLICY "Users can update own profile (no role change)"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- ============================================================
-- 2. Admin 전용 role 변경 RPC
-- ============================================================
CREATE OR REPLACE FUNCTION admin_update_user_role(
  target_user_id UUID,
  new_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 호출자가 admin인지 검증
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied: only admins can change roles';
  END IF;

  -- role 값 검증
  IF new_role NOT IN ('employee', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: must be employee or admin';
  END IF;

  -- 자기 자신의 role은 변경 불가 (실수 방지)
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;

  UPDATE public.profiles
  SET role = new_role, updated_at = NOW()
  WHERE id = target_user_id;
END;
$$;
