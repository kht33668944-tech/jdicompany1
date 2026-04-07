-- 053_fix_attendance_rpc_timezone.sql
-- 버그픽스: CURRENT_DATE(UTC) → KST 기준 날짜로 변경
-- CURRENT_DATE는 Supabase DB 서버(UTC) 기준이므로 KST 08:30 출근 시
-- UTC 전날 23:30으로 인식되어 전날 날짜로 기록되는 문제 수정

CREATE OR REPLACE FUNCTION public.attendance_check_in()
RETURNS public.attendance_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record attendance_records;
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'Not approved';
  END IF;

  -- 이미 오늘 출근 기록이 있으면 그대로 반환 (중복 출근 방지)
  SELECT * INTO v_record FROM attendance_records
    WHERE user_id = auth.uid() AND work_date = v_today;

  IF v_record.id IS NOT NULL AND v_record.check_in IS NOT NULL THEN
    RETURN v_record;
  END IF;

  INSERT INTO attendance_records (user_id, work_date, check_in, status)
  VALUES (auth.uid(), v_today, NOW(), '근무중')
  ON CONFLICT (user_id, work_date)
  DO UPDATE SET check_in = NOW(), status = '근무중', updated_at = NOW()
  WHERE attendance_records.check_in IS NULL
  RETURNING * INTO v_record;

  IF v_record.id IS NULL THEN
    SELECT * INTO v_record FROM attendance_records
      WHERE user_id = auth.uid() AND work_date = v_today;
  END IF;

  RETURN v_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.attendance_check_out()
RETURNS public.attendance_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record attendance_records;
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'Not approved';
  END IF;

  UPDATE attendance_records
  SET check_out = NOW(), status = '퇴근', updated_at = NOW()
  WHERE user_id = auth.uid() AND work_date = v_today AND status = '근무중'
  RETURNING * INTO v_record;

  IF v_record.id IS NULL THEN
    RAISE EXCEPTION '출근 기록이 없거나 이미 퇴근 처리되었습니다.';
  END IF;

  RETURN v_record;
END;
$$;
