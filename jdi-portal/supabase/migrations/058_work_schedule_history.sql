-- 058_work_schedule_history.sql
-- 근무시간을 단일 값에서 "적용 시작일 기준 이력" 구조로 전환
-- + 직원 변경 요청 → 관리자 승인 흐름

-- =========================================
-- 1. work_schedules : 이력 테이블
-- =========================================
CREATE TABLE public.work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  work_start_time TIME NOT NULL,
  work_end_time TIME NOT NULL,
  effective_from DATE NOT NULL,
  is_initial_seed BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, effective_from)
);

CREATE INDEX work_schedules_user_effective_idx
  ON public.work_schedules (user_id, effective_from DESC);

COMMENT ON TABLE public.work_schedules IS
  '직원별 근무시간 이력. effective_from 기준으로 기간을 결정.';

ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws_select_own_or_admin"
  ON public.work_schedules
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "ws_admin_all"
  ON public.work_schedules
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =========================================
-- 2. work_schedule_change_requests : 변경 요청
-- =========================================
CREATE TABLE public.work_schedule_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_start_time TIME NOT NULL,
  requested_end_time TIME NOT NULL,
  effective_from DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT '대기중'
    CHECK (status IN ('대기중', '승인', '반려')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX wscr_status_idx
  ON public.work_schedule_change_requests (status, created_at DESC);
CREATE INDEX wscr_user_idx
  ON public.work_schedule_change_requests (user_id, created_at DESC);

ALTER TABLE public.work_schedule_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wscr_select_own_or_admin"
  ON public.work_schedule_change_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "wscr_insert_own"
  ON public.work_schedule_change_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "wscr_delete_own_pending"
  ON public.work_schedule_change_requests
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND status = '대기중');

CREATE POLICY "wscr_admin_update"
  ON public.work_schedule_change_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =========================================
-- 3. 시드: 기존 직원의 현재 근무시간을 초기 이력으로 이전
-- =========================================
INSERT INTO public.work_schedules (
  user_id, work_start_time, work_end_time,
  effective_from, is_initial_seed, created_by
)
SELECT
  id,
  COALESCE(work_start_time, '09:00:00'::TIME),
  COALESCE(work_end_time, '18:00:00'::TIME),
  '2000-01-01'::DATE,
  TRUE,
  NULL
FROM public.profiles
ON CONFLICT (user_id, effective_from) DO NOTHING;

-- =========================================
-- 4. RPC 함수
-- =========================================

-- 헬퍼: 호출자의 비-시드 이력 행 개수
CREATE OR REPLACE FUNCTION public.work_schedule_non_seed_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.work_schedules
  WHERE user_id = p_user_id AND is_initial_seed = FALSE;
$$;

-- 4-1. 첫 설정 (직원 본인, non-seed가 0개일 때만)
CREATE OR REPLACE FUNCTION public.set_initial_work_schedule(
  p_start TIME,
  p_end TIME
)
RETURNS public.work_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_row public.work_schedules;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  IF public.work_schedule_non_seed_count(v_uid) > 0 THEN
    RAISE EXCEPTION '이미 근무시간이 설정되어 있습니다. 변경 요청을 제출해주세요.';
  END IF;

  INSERT INTO public.work_schedules (
    user_id, work_start_time, work_end_time,
    effective_from, is_initial_seed, created_by
  )
  VALUES (v_uid, p_start, p_end, v_today, FALSE, v_uid)
  ON CONFLICT (user_id, effective_from)
  DO UPDATE SET
    work_start_time = EXCLUDED.work_start_time,
    work_end_time = EXCLUDED.work_end_time,
    is_initial_seed = FALSE,
    created_by = EXCLUDED.created_by
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_initial_work_schedule(TIME, TIME) TO authenticated;

-- 4-2. 변경 요청 제출
CREATE OR REPLACE FUNCTION public.submit_work_schedule_change_request(
  p_start TIME,
  p_end TIME,
  p_effective_from DATE,
  p_reason TEXT
)
RETURNS public.work_schedule_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_row public.work_schedule_change_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  IF public.work_schedule_non_seed_count(v_uid) = 0 THEN
    RAISE EXCEPTION '먼저 근무시간을 설정해주세요.';
  END IF;

  IF p_effective_from < v_today THEN
    RAISE EXCEPTION '적용 시작일은 오늘 또는 이후여야 합니다.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.work_schedule_change_requests
    WHERE user_id = v_uid AND status = '대기중'
  ) THEN
    RAISE EXCEPTION '이미 대기 중인 변경 요청이 있습니다.';
  END IF;

  INSERT INTO public.work_schedule_change_requests (
    user_id, requested_start_time, requested_end_time,
    effective_from, reason
  )
  VALUES (v_uid, p_start, p_end, p_effective_from, NULLIF(p_reason, ''))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_work_schedule_change_request(TIME, TIME, DATE, TEXT) TO authenticated;

-- 4-3. 변경 요청 승인 (관리자)
CREATE OR REPLACE FUNCTION public.approve_work_schedule_change_request(
  p_request_id UUID
)
RETURNS public.work_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_req public.work_schedule_change_requests;
  v_row public.work_schedules;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '권한이 없습니다: 관리자만 가능합니다.';
  END IF;

  SELECT * INTO v_req
  FROM public.work_schedule_change_requests
  WHERE id = p_request_id AND status = '대기중'
  FOR UPDATE;

  IF v_req IS NULL THEN
    RAISE EXCEPTION '대기 중인 요청을 찾을 수 없습니다.';
  END IF;

  INSERT INTO public.work_schedules (
    user_id, work_start_time, work_end_time,
    effective_from, is_initial_seed, created_by
  )
  VALUES (
    v_req.user_id, v_req.requested_start_time, v_req.requested_end_time,
    v_req.effective_from, FALSE, v_uid
  )
  ON CONFLICT (user_id, effective_from)
  DO UPDATE SET
    work_start_time = EXCLUDED.work_start_time,
    work_end_time = EXCLUDED.work_end_time,
    is_initial_seed = FALSE,
    created_by = EXCLUDED.created_by
  RETURNING * INTO v_row;

  UPDATE public.work_schedule_change_requests
  SET status = '승인', reviewed_by = v_uid, reviewed_at = NOW()
  WHERE id = p_request_id;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_work_schedule_change_request(UUID) TO authenticated;

-- 4-4. 변경 요청 반려 (관리자)
CREATE OR REPLACE FUNCTION public.reject_work_schedule_change_request(
  p_request_id UUID,
  p_reason TEXT
)
RETURNS public.work_schedule_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.work_schedule_change_requests;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '권한이 없습니다: 관리자만 가능합니다.';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION '반려 사유를 입력해주세요.';
  END IF;

  UPDATE public.work_schedule_change_requests
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

GRANT EXECUTE ON FUNCTION public.reject_work_schedule_change_request(UUID, TEXT) TO authenticated;

-- 4-5. 관리자가 직원의 근무시간을 직접 저장 (즉시 반영)
CREATE OR REPLACE FUNCTION public.admin_set_work_schedule(
  p_user_id UUID,
  p_start TIME,
  p_end TIME,
  p_effective_from DATE
)
RETURNS public.work_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.work_schedules;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '권한이 없습니다: 관리자만 가능합니다.';
  END IF;

  INSERT INTO public.work_schedules (
    user_id, work_start_time, work_end_time,
    effective_from, is_initial_seed, created_by
  )
  VALUES (p_user_id, p_start, p_end, p_effective_from, FALSE, v_uid)
  ON CONFLICT (user_id, effective_from)
  DO UPDATE SET
    work_start_time = EXCLUDED.work_start_time,
    work_end_time = EXCLUDED.work_end_time,
    is_initial_seed = FALSE,
    created_by = EXCLUDED.created_by
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_work_schedule(UUID, TIME, TIME, DATE) TO authenticated;
