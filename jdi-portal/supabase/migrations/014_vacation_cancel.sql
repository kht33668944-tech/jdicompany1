-- 휴가 상태에 '취소요청', '취소' 추가
ALTER TABLE public.vacation_requests DROP CONSTRAINT IF EXISTS vacation_requests_status_check;
ALTER TABLE public.vacation_requests
  ADD CONSTRAINT vacation_requests_status_check
  CHECK (status IN ('대기중', '승인', '반려', '취소요청', '취소'));

-- 신청자가 승인된 휴가 취소 요청
CREATE OR REPLACE FUNCTION public.request_vacation_cancel(
  p_request_id UUID
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

  UPDATE public.vacation_requests
  SET
    status = '취소요청',
    updated_at = NOW()
  WHERE id = p_request_id
    AND user_id = auth.uid()
    AND status = '승인';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot request cancel for this vacation';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_vacation_cancel(UUID) TO authenticated;

-- 관리자가 취소 승인 또는 직접 취소 (연차 복원 + 스케줄 삭제)
CREATE OR REPLACE FUNCTION public.cancel_approved_vacation(
  p_request_id UUID,
  p_admin_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.vacation_requests%ROWTYPE;
  v_user_name TEXT;
  v_schedule_title TEXT;
BEGIN
  -- 관리자 권한 확인
  IF auth.uid() IS NULL OR auth.uid() <> p_admin_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- 요청 조회 (승인 또는 취소요청 상태만)
  SELECT *
  INTO v_request
  FROM public.vacation_requests
  WHERE id = p_request_id
    AND status IN ('승인', '취소요청')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacation request not found or not cancellable';
  END IF;

  -- 상태를 취소로 변경
  UPDATE public.vacation_requests
  SET
    status = '취소',
    reviewed_by = p_admin_id,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_request_id;

  -- 연차 일수 복원
  UPDATE public.vacation_balances
  SET
    used_days = GREATEST(0, used_days - v_request.days_count),
    updated_at = NOW()
  WHERE user_id = v_request.user_id
    AND year = EXTRACT(YEAR FROM v_request.start_date)::INTEGER;

  -- 연동된 스케줄 삭제
  SELECT full_name INTO v_user_name
  FROM public.profiles WHERE id = v_request.user_id;

  v_schedule_title := v_request.vacation_type || ' (' || v_user_name || ')';

  DELETE FROM public.schedules
  WHERE title = v_schedule_title
    AND category = 'VACATION'
    AND created_by = v_request.user_id
    AND start_time = (v_request.start_date::TEXT || 'T00:00:00+09:00')::TIMESTAMPTZ;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_approved_vacation(UUID, UUID) TO authenticated;
