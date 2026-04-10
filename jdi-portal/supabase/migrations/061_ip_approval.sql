-- 061_ip_approval.sql
-- 출퇴근 허용 IP 변경에 승인 흐름 추가
-- 첫 1회는 직원이 자유롭게 설정, 이후 변경은 관리자 승인 필요

-- =========================================
-- 1. profiles.allowed_ip_locked
-- =========================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allowed_ip_locked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.allowed_ip_locked IS
  'TRUE면 허용 IP를 직접 변경 불가 (변경 요청 필요). 첫 직접 저장 시 자동으로 TRUE.';

-- =========================================
-- 2. ip_change_requests : 변경 요청
-- =========================================
CREATE TABLE public.ip_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_ip TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT '대기중'
    CHECK (status IN ('대기중', '승인', '반려')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ipcr_status_idx
  ON public.ip_change_requests (status, created_at DESC);
CREATE INDEX ipcr_user_idx
  ON public.ip_change_requests (user_id, created_at DESC);

ALTER TABLE public.ip_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ipcr_select_own_or_admin"
  ON public.ip_change_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "ipcr_insert_own"
  ON public.ip_change_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ipcr_delete_own_pending"
  ON public.ip_change_requests
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND status = '대기중');

CREATE POLICY "ipcr_admin_update"
  ON public.ip_change_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =========================================
-- 3. RPC 함수
-- =========================================

-- 3-1. 첫 설정 (직원 본인, allowed_ip_locked = false 일 때만)
CREATE OR REPLACE FUNCTION public.set_initial_allowed_ip(p_ip TEXT)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND allowed_ip_locked = TRUE) THEN
    RAISE EXCEPTION '허용 IP가 이미 잠겨 있습니다. 변경 요청을 제출해주세요.';
  END IF;

  UPDATE public.profiles
  SET allowed_ip = p_ip,
      allowed_ip_locked = TRUE,
      updated_at = NOW()
  WHERE id = v_uid
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_initial_allowed_ip(TEXT) TO authenticated;

-- 3-2. 변경 요청 제출
CREATE OR REPLACE FUNCTION public.submit_ip_change_request(
  p_ip TEXT,
  p_reason TEXT
)
RETURNS public.ip_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.ip_change_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ip_change_requests
    WHERE user_id = v_uid AND status = '대기중'
  ) THEN
    RAISE EXCEPTION '이미 대기 중인 변경 요청이 있습니다.';
  END IF;

  INSERT INTO public.ip_change_requests (
    user_id, requested_ip, reason
  )
  VALUES (v_uid, p_ip, NULLIF(p_reason, ''))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_ip_change_request(TEXT, TEXT) TO authenticated;

-- 3-3. 변경 요청 승인 (관리자)
CREATE OR REPLACE FUNCTION public.approve_ip_change_request(
  p_request_id UUID
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_req public.ip_change_requests;
  v_row public.profiles;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '권한이 없습니다: 관리자만 가능합니다.';
  END IF;

  SELECT * INTO v_req
  FROM public.ip_change_requests
  WHERE id = p_request_id AND status = '대기중'
  FOR UPDATE;

  IF v_req IS NULL THEN
    RAISE EXCEPTION '대기 중인 요청을 찾을 수 없습니다.';
  END IF;

  UPDATE public.profiles
  SET allowed_ip = v_req.requested_ip,
      allowed_ip_locked = TRUE,
      updated_at = NOW()
  WHERE id = v_req.user_id
  RETURNING * INTO v_row;

  UPDATE public.ip_change_requests
  SET status = '승인', reviewed_by = v_uid, reviewed_at = NOW()
  WHERE id = p_request_id;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_ip_change_request(UUID) TO authenticated;

-- 3-4. 변경 요청 반려 (관리자)
CREATE OR REPLACE FUNCTION public.reject_ip_change_request(
  p_request_id UUID,
  p_reason TEXT
)
RETURNS public.ip_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.ip_change_requests;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '권한이 없습니다: 관리자만 가능합니다.';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION '반려 사유를 입력해주세요.';
  END IF;

  UPDATE public.ip_change_requests
  SET status = '반려',
      reviewed_by = v_uid,
      reviewed_at = NOW(),
      reject_reason = p_reason
  WHERE id = p_request_id AND status = '대기중'
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RAISE EXCEPTION '대기 중인 요청을 찾을 수 없습니다.';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_ip_change_request(UUID, TEXT) TO authenticated;
