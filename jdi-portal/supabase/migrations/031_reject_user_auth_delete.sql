-- 031_reject_user_auth_delete.sql
-- 보안 수정: 반려 시 Auth 사용자도 함께 삭제
-- 기존 admin_reject_user는 profiles만 삭제하고 auth.users는 남김
-- profiles.id → auth.users.id FK는 CASCADE가 반대 방향이라 자동 삭제 안됨

CREATE OR REPLACE FUNCTION public.admin_reject_user(p_target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 관리자 권한 확인
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- 미승인 사용자인지 확인
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_target_user_id AND is_approved = FALSE
  ) THEN
    RAISE EXCEPTION 'User not found or already approved';
  END IF;

  -- 프로필 삭제 (다른 테이블의 FK CASCADE로 관련 데이터도 삭제)
  DELETE FROM public.profiles WHERE id = p_target_user_id;

  -- Auth 사용자도 명시적으로 삭제
  DELETE FROM auth.users WHERE id = p_target_user_id;
END;
$$;
