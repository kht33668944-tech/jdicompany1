-- 회원가입 승인 시스템: is_approved 컬럼 추가
-- 신규 가입자는 is_approved = false, 관리자 승인 후 true

-- 1. profiles 테이블에 is_approved 컬럼 추가
ALTER TABLE public.profiles
  ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. 기존 사용자 모두 승인 상태로 설정
UPDATE public.profiles SET is_approved = TRUE;

-- 3. 트리거 함수 업데이트: 신규 가입 시 is_approved = false
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, is_approved)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    FALSE
  );
  RETURN NEW;
END;
$$;

-- 4. 관리자가 사용자 승인하는 함수
CREATE OR REPLACE FUNCTION public.admin_approve_user(
  p_target_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.profiles
  SET is_approved = TRUE, updated_at = NOW()
  WHERE id = p_target_user_id AND is_approved = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found or already approved';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_user(UUID) TO authenticated;

-- 5. 관리자가 미승인 사용자 삭제하는 함수
CREATE OR REPLACE FUNCTION public.admin_reject_user(
  p_target_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- 프로필 삭제 (CASCADE로 auth.users도 삭제됨)
  DELETE FROM public.profiles
  WHERE id = p_target_user_id AND is_approved = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found or already approved';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reject_user(UUID) TO authenticated;
