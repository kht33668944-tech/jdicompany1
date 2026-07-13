-- 승인된 직원이 대시보드에서 오늘의 직원별 출근 상태만 확인할 수 있게 한다.
-- 출퇴근 시각, 메모, 근무시간 등 상세 근태 정보는 노출하지 않는다.
CREATE OR REPLACE FUNCTION public.get_today_attendance_statuses()
RETURNS TABLE (user_id UUID, status TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ar.user_id, ar.status
  FROM public.attendance_records ar
  WHERE public.is_approved_user()
    AND ar.work_date = (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
$$;

REVOKE ALL ON FUNCTION public.get_today_attendance_statuses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_today_attendance_statuses() TO authenticated;
