-- 062_attendance_ip_check.sql
-- 보안: 출퇴근 RPC에 서버사이드 IP 검증 추가
-- 클라이언트 우회 방지를 위해 DB 레벨에서 allowed_ip 대조

CREATE OR REPLACE FUNCTION public.attendance_check_in(p_client_ip TEXT DEFAULT NULL)
RETURNS public.attendance_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record attendance_records;
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_allowed_ip TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'Not approved';
  END IF;

  -- IP 제한 검사
  SELECT allowed_ip INTO v_allowed_ip FROM profiles WHERE id = auth.uid();
  IF v_allowed_ip IS NOT NULL AND p_client_ip IS DISTINCT FROM v_allowed_ip THEN
    RAISE EXCEPTION '등록된 IP에서만 출근할 수 있습니다. (현재: %, 허용: %)', p_client_ip, v_allowed_ip;
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

CREATE OR REPLACE FUNCTION public.attendance_check_out(p_client_ip TEXT DEFAULT NULL)
RETURNS public.attendance_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record attendance_records;
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_allowed_ip TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'Not approved';
  END IF;

  -- IP 제한 검사
  SELECT allowed_ip INTO v_allowed_ip FROM profiles WHERE id = auth.uid();
  IF v_allowed_ip IS NOT NULL AND p_client_ip IS DISTINCT FROM v_allowed_ip THEN
    RAISE EXCEPTION '등록된 IP에서만 퇴근할 수 있습니다. (현재: %, 허용: %)', p_client_ip, v_allowed_ip;
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
