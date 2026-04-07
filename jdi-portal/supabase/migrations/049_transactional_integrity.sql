-- ============================================
-- 049_transactional_integrity.sql
-- Phase 2 트랜잭션 무결성
--   1. approve_correction_request RPC: 정정 승인 + 출퇴근 기록 반영을 한 트랜잭션으로
--   2. update_schedule_with_participants RPC: 일정 본문 + 참가자 diff 업데이트를 한 트랜잭션으로
-- ============================================

-- ============================================
-- 1. 출퇴근 정정 승인 RPC
--    승인 상태 갱신과 attendance_records 반영을 원자적으로 처리
-- ============================================
CREATE OR REPLACE FUNCTION public.approve_correction_request(
  p_request_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID;
  v_is_admin BOOLEAN;
  v_correction RECORD;
  v_new_status TEXT;
BEGIN
  v_admin := auth.uid();
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_admin AND role = 'admin'
  ) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  -- 대기중 정정 요청을 잠그고 읽기
  SELECT *
    INTO v_correction
    FROM public.correction_requests
   WHERE id = p_request_id AND status = '대기중'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending correction request not found: %', p_request_id;
  END IF;

  -- 정정 상태 승인 처리
  UPDATE public.correction_requests
     SET status = '승인',
         reviewed_by = v_admin,
         reviewed_at = now()
   WHERE id = p_request_id;

  -- attendance_records 반영
  IF v_correction.request_type = '기록누락' THEN
    v_new_status := CASE
      WHEN v_correction.requested_check_out IS NOT NULL THEN '퇴근'
      ELSE '근무중'
    END;

    INSERT INTO public.attendance_records (user_id, work_date, check_in, check_out, status)
    VALUES (
      v_correction.user_id,
      v_correction.target_date,
      v_correction.requested_check_in,
      v_correction.requested_check_out,
      v_new_status
    )
    ON CONFLICT (user_id, work_date) DO UPDATE SET
      check_in = EXCLUDED.check_in,
      check_out = EXCLUDED.check_out,
      status = EXCLUDED.status;
  ELSE
    UPDATE public.attendance_records
       SET check_in = COALESCE(v_correction.requested_check_in, check_in),
           check_out = COALESCE(v_correction.requested_check_out, check_out),
           status = CASE
             WHEN v_correction.requested_check_out IS NOT NULL THEN '퇴근'
             ELSE status
           END
     WHERE user_id = v_correction.user_id
       AND work_date = v_correction.target_date;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_correction_request(UUID) TO authenticated;

-- ============================================
-- 2. 일정 + 참가자 동시 업데이트 RPC
--    본문 수정과 참가자 diff 갱신을 원자적으로 처리
--    p_updates: 변경할 필드만 담은 JSONB
--    p_participant_ids: 최종 참가자 목록 (NULL 이면 변경 없음)
-- ============================================
CREATE OR REPLACE FUNCTION public.update_schedule_with_participants(
  p_schedule_id UUID,
  p_updates JSONB,
  p_participant_ids UUID[] DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
  v_is_admin BOOLEAN;
  v_creator UUID;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 일정 잠그고 권한 확인
  SELECT created_by INTO v_creator
    FROM public.schedules
   WHERE id = p_schedule_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule not found: %', p_schedule_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user AND role = 'admin'
  ) INTO v_is_admin;

  IF v_creator <> v_user AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Forbidden: only creator or admin can update';
  END IF;

  -- 본문 업데이트 (전달된 키만 반영, JSON null 은 NULL 로 반영)
  UPDATE public.schedules SET
    title = COALESCE(p_updates->>'title', title),
    description = CASE WHEN p_updates ? 'description' THEN p_updates->>'description' ELSE description END,
    category = COALESCE(p_updates->>'category', category),
    start_time = COALESCE((p_updates->>'start_time')::TIMESTAMPTZ, start_time),
    end_time = COALESCE((p_updates->>'end_time')::TIMESTAMPTZ, end_time),
    is_all_day = COALESCE((p_updates->>'is_all_day')::BOOLEAN, is_all_day),
    location = CASE WHEN p_updates ? 'location' THEN p_updates->>'location' ELSE location END,
    visibility = COALESCE(p_updates->>'visibility', visibility),
    updated_at = now()
  WHERE id = p_schedule_id;

  -- 참가자 diff 업데이트
  IF p_participant_ids IS NOT NULL THEN
    -- 1) 새 목록에 없는 기존 참가자 삭제
    DELETE FROM public.schedule_participants
     WHERE schedule_id = p_schedule_id
       AND user_id <> ALL(p_participant_ids);

    -- 2) 새로 추가된 참가자만 INSERT (중복 방지)
    INSERT INTO public.schedule_participants (schedule_id, user_id)
    SELECT p_schedule_id, uid
      FROM unnest(p_participant_ids) AS uid
     WHERE NOT EXISTS (
       SELECT 1 FROM public.schedule_participants sp
        WHERE sp.schedule_id = p_schedule_id AND sp.user_id = uid
     );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_schedule_with_participants(UUID, JSONB, UUID[]) TO authenticated;
