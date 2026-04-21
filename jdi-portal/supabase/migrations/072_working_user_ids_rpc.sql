-- 채팅 사이드바 "온라인" 표시를 실제 출근(근무중) 상태로 전환하기 위한 RPC
-- 반환: 오늘(KST) 기준 attendance_records.status = '근무중' 인 user_id 배열
-- 최소 정보만 노출 (출퇴근 시각/메모 등은 포함하지 않음)

CREATE OR REPLACE FUNCTION public.get_working_user_ids()
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result uuid[];
BEGIN
  -- 승인된 사용자만 호출 가능 (SECURITY DEFINER 가드)
  IF NOT public.is_approved_user() THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT COALESCE(ARRAY_AGG(user_id), ARRAY[]::uuid[])
  INTO result
  FROM public.attendance_records
  WHERE work_date = (NOW() AT TIME ZONE 'Asia/Seoul')::DATE
    AND status = '근무중';

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_working_user_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_working_user_ids() TO authenticated;
