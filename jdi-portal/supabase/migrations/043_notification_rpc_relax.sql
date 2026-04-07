-- ============================================
-- 043_notification_rpc_relax.sql
-- 알림 생성 RPC 권한 완화: 승인된 사용자도 정해진 type만 알림 생성 가능
--
-- 정책:
--  - 승인된 사용자: 업무 협업 알림(할일/댓글/일정)만 생성 허용
--  - 관리자: 모든 알림 생성 가능 (시스템 공지/휴가 승인 등)
--  - 미승인 사용자: 차단
-- ============================================

-- 허용 type 화이트리스트 (승인된 일반 사용자)
-- 관리자는 이 화이트리스트와 무관하게 모든 type 허용
CREATE OR REPLACE FUNCTION public.is_user_allowed_notification_type(p_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_type IN (
    'task_assigned',
    'task_comment',
    'task_status_changed',
    'task_deadline',
    'schedule_invite'
  );
$$;

CREATE OR REPLACE FUNCTION public.insert_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 승인된 사용자만 (미승인 차단)
  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'User not approved';
  END IF;

  -- 관리자 여부 확인
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  -- 일반 사용자: 화이트리스트 type만 허용
  IF NOT v_is_admin AND NOT public.is_user_allowed_notification_type(p_type) THEN
    RAISE EXCEPTION 'Permission denied: type % requires admin', p_type;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
  VALUES (p_user_id, p_type, p_title, p_body, p_link, p_metadata);
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_notifications_batch(
  p_notifications JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notif JSONB;
  v_is_admin BOOLEAN;
  v_type TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'User not approved';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  -- 비관리자는 모든 항목의 type이 화이트리스트에 있어야 함
  IF NOT v_is_admin THEN
    FOR notif IN SELECT * FROM jsonb_array_elements(p_notifications)
    LOOP
      v_type := notif->>'type';
      IF NOT public.is_user_allowed_notification_type(v_type) THEN
        RAISE EXCEPTION 'Permission denied: type % requires admin', v_type;
      END IF;
    END LOOP;
  END IF;

  FOR notif IN SELECT * FROM jsonb_array_elements(p_notifications)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
    VALUES (
      (notif->>'user_id')::UUID,
      notif->>'type',
      notif->>'title',
      notif->>'body',
      notif->>'link',
      COALESCE(notif->'metadata', '{}'::JSONB)
    );
  END LOOP;
END;
$$;
