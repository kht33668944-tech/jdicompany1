-- 스케줄-연차 연동을 제목 매칭 → vacation_request_id FK로 변경
-- 기존: 취소 시 title 문자열 비교로 스케줄 삭제 → 이름/타임존 불일치 시 삭제 실패
-- 수정: vacation_request_id로 정확한 매칭

-- 1. schedules 테이블에 vacation_request_id 컬럼 추가
ALTER TABLE public.schedules
  ADD COLUMN vacation_request_id UUID REFERENCES public.vacation_requests(id) ON DELETE CASCADE;

CREATE INDEX idx_schedules_vacation_request ON public.schedules(vacation_request_id)
  WHERE vacation_request_id IS NOT NULL;

-- 2. 기존 VACATION 스케줄에 vacation_request_id 역매칭 (best effort)
UPDATE public.schedules s
SET vacation_request_id = vr.id
FROM public.vacation_requests vr
JOIN public.profiles p ON p.id = vr.user_id
WHERE s.category = 'VACATION'
  AND s.created_by = vr.user_id
  AND s.vacation_request_id IS NULL
  AND s.title = vr.vacation_type || ' (' || p.full_name || ')'
  AND s.start_time = (vr.start_date::TEXT || 'T00:00:00+09:00')::TIMESTAMPTZ;

-- 3. approve_vacation_request: vacation_request_id 저장하도록 수정
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
  IF auth.uid() IS NULL OR auth.uid() <> p_admin_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_request
  FROM public.vacation_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacation request not found';
  END IF;

  IF v_request.status <> '대기중' THEN
    RAISE EXCEPTION 'Vacation request already reviewed';
  END IF;

  SELECT hire_date, full_name
  INTO v_hire_date, v_user_name
  FROM public.profiles
  WHERE id = v_request.user_id;

  UPDATE public.vacation_requests
  SET status = '승인',
      reviewed_by = p_admin_id,
      reviewed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_request_id;

  INSERT INTO public.vacation_balances (
    user_id, year, total_days, used_days
  ) VALUES (
    v_request.user_id,
    EXTRACT(YEAR FROM v_request.start_date)::INTEGER,
    public.calculate_vacation_days(v_hire_date, EXTRACT(YEAR FROM v_request.start_date)::INTEGER),
    v_request.days_count
  )
  ON CONFLICT (user_id, year)
  DO UPDATE SET
    used_days = public.vacation_balances.used_days + EXCLUDED.used_days,
    updated_at = NOW();

  v_schedule_title := v_request.vacation_type || ' (' || v_user_name || ')';

  INSERT INTO public.schedules (
    title, description, category,
    start_time, end_time, is_all_day,
    visibility, created_by, vacation_request_id
  ) VALUES (
    v_schedule_title,
    v_request.reason,
    'VACATION',
    (v_request.start_date::TEXT || 'T00:00:00+09:00')::TIMESTAMPTZ,
    (v_request.end_date::TEXT || 'T23:59:59+09:00')::TIMESTAMPTZ,
    TRUE,
    'company',
    v_request.user_id,
    p_request_id
  );
END;
$$;

-- 4. cancel_approved_vacation: vacation_request_id로 삭제하도록 수정
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
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_admin_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_request
  FROM public.vacation_requests
  WHERE id = p_request_id
    AND status IN ('승인', '취소요청')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacation request not found or not cancellable';
  END IF;

  UPDATE public.vacation_requests
  SET status = '취소',
      reviewed_by = p_admin_id,
      reviewed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_request_id;

  UPDATE public.vacation_balances
  SET used_days = GREATEST(0, used_days - v_request.days_count),
      updated_at = NOW()
  WHERE user_id = v_request.user_id
    AND year = EXTRACT(YEAR FROM v_request.start_date)::INTEGER;

  -- vacation_request_id로 정확하게 삭제 (기존: 제목 문자열 매칭)
  DELETE FROM public.schedules
  WHERE vacation_request_id = p_request_id;
END;
$$;
