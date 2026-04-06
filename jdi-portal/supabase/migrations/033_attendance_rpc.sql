-- 033_attendance_rpc.sql
-- 보안 강화: 출퇴근을 전용 RPC로만 허용, 직접 INSERT/UPDATE 차단

-- ============================================================
-- 1. 출근 RPC — 하루에 한 번만 가능, 이미 출근했으면 무시
-- ============================================================
CREATE OR REPLACE FUNCTION public.attendance_check_in()
RETURNS public.attendance_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record attendance_records;
  v_today DATE := CURRENT_DATE;
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

-- ============================================================
-- 2. 퇴근 RPC — 출근 상태일 때만 가능
-- ============================================================
CREATE OR REPLACE FUNCTION public.attendance_check_out()
RETURNS public.attendance_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record attendance_records;
  v_today DATE := CURRENT_DATE;
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

GRANT EXECUTE ON FUNCTION public.attendance_check_in() TO authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_check_out() TO authenticated;

-- ============================================================
-- 3. 일반 사용자 직접 INSERT/UPDATE 차단 (관리자만 허용)
-- ============================================================
DROP POLICY IF EXISTS "Approved users can manage own attendance" ON public.attendance_records;
CREATE POLICY "Only admins can direct insert attendance"
  ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Approved users can update own attendance" ON public.attendance_records;
CREATE POLICY "Only admins can direct update attendance"
  ON public.attendance_records FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 기존 admin update 정책이 이미 있으므로 중복 제거
DROP POLICY IF EXISTS "Approved admins can update any attendance" ON public.attendance_records;
