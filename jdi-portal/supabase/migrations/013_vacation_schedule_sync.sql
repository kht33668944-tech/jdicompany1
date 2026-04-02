-- 휴가 승인 시 스케줄에 자동 등록되도록 함수 업데이트
CREATE OR REPLACE FUNCTION public.approve_vacation_request(
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
  v_hire_date DATE;
  v_user_name TEXT;
  v_schedule_title TEXT;
BEGIN
  -- 권한 확인
  IF auth.uid() IS NULL OR auth.uid() <> p_admin_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- 요청 조회
  SELECT *
  INTO v_request
  FROM public.vacation_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacation request not found';
  END IF;

  IF v_request.status <> '대기중' THEN
    RAISE EXCEPTION 'Vacation request already reviewed';
  END IF;

  -- 사용자 정보 조회
  SELECT hire_date, full_name
  INTO v_hire_date, v_user_name
  FROM public.profiles
  WHERE id = v_request.user_id;

  -- 휴가 요청 승인
  UPDATE public.vacation_requests
  SET
    status = '승인',
    reviewed_by = p_admin_id,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_request_id;

  -- 연차 잔여일수 업데이트
  INSERT INTO public.vacation_balances (
    user_id,
    year,
    total_days,
    used_days
  )
  VALUES (
    v_request.user_id,
    EXTRACT(YEAR FROM v_request.start_date)::INTEGER,
    public.calculate_vacation_days(v_hire_date, EXTRACT(YEAR FROM v_request.start_date)::INTEGER),
    v_request.days_count
  )
  ON CONFLICT (user_id, year)
  DO UPDATE SET
    used_days = public.vacation_balances.used_days + EXCLUDED.used_days,
    updated_at = NOW();

  -- 스케줄 제목 생성
  v_schedule_title := v_request.vacation_type || ' (' || v_user_name || ')';

  -- 스케줄에 자동 등록
  INSERT INTO public.schedules (
    title,
    description,
    category,
    start_time,
    end_time,
    is_all_day,
    visibility,
    created_by
  )
  VALUES (
    v_schedule_title,
    v_request.reason,
    'VACATION',
    (v_request.start_date::TEXT || 'T00:00:00+09:00')::TIMESTAMPTZ,
    (v_request.end_date::TEXT || 'T23:59:59+09:00')::TIMESTAMPTZ,
    TRUE,
    'company',
    v_request.user_id
  );
END;
$$;
