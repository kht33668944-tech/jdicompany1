-- 029_notification_rpc_restrict.sql
-- 보안 강화: 알림 생성 RPC를 관리자 전용으로 제한

-- 기존 함수 교체: 관리자만 알림 생성 가능
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
BEGIN
  -- 인증 확인
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 관리자만 알림 생성 가능
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied: only admins can send notifications';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
  VALUES (p_user_id, p_type, p_title, p_body, p_link, p_metadata);
END;
$$;

-- 배치 버전도 동일하게 제한
CREATE OR REPLACE FUNCTION public.insert_notifications_batch(
  p_notifications JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notif JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 관리자만 알림 생성 가능
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied: only admins can send notifications';
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
