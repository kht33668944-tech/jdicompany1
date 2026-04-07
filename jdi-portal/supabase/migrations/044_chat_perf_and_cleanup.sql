-- ============================================
-- 044_chat_perf_and_cleanup.sql
-- 채팅 성능 개선 + 스토리지 정리
--   1) mark_channel_read RPC: markAsRead 4 round-trip → 1
--   2) get_user_channels RPC: getChannels N+1 → 단일 호출
--   3) channels DELETE 트리거: chat-attachments 스토리지 정리
-- ============================================

-- ============================================
-- 1. mark_channel_read RPC
--    last_read_at 갱신 + 누락된 read_receipt 일괄 INSERT 를 1회 호출로
-- ============================================
CREATE OR REPLACE FUNCTION public.mark_channel_read(p_channel_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_old_last_read TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 갱신 전 last_read_at 캡처 후 즉시 UPDATE
  SELECT last_read_at INTO v_old_last_read
    FROM public.channel_members
   WHERE channel_id = p_channel_id AND user_id = v_user_id;

  -- 멤버가 아니면 종료
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.channel_members
     SET last_read_at = now()
   WHERE channel_id = p_channel_id
     AND user_id = v_user_id;

  -- 안 읽은 메시지에 대한 read_receipt 일괄 INSERT (중복 무시)
  INSERT INTO public.message_reads (message_id, user_id)
  SELECT m.id, v_user_id
    FROM public.messages m
   WHERE m.channel_id = p_channel_id
     AND m.is_deleted = false
     AND m.user_id <> v_user_id
     AND (v_old_last_read IS NULL OR m.created_at > v_old_last_read)
  ON CONFLICT (message_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_channel_read(UUID) TO authenticated;

-- ============================================
-- 2. get_user_channels RPC
--    내가 속한 채널 목록 + 마지막 메시지 + 멤버 수 + 안 읽은 수 + 발신자 이름
--    을 단일 SQL 로 집계 후 JSON 배열 반환
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_channels(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result JSONB;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  WITH my_channels AS (
    SELECT cm.channel_id, cm.last_read_at, cm.is_muted, cm.is_favorite
      FROM public.channel_members cm
     WHERE cm.user_id = v_user_id
  ),
  member_counts AS (
    SELECT channel_id, COUNT(*)::INT AS member_count
      FROM public.channel_members
     WHERE channel_id IN (SELECT channel_id FROM my_channels)
     GROUP BY channel_id
  ),
  unread AS (
    SELECT m.channel_id, COUNT(*)::INT AS unread_count
      FROM public.messages m
      JOIN my_channels mc ON mc.channel_id = m.channel_id
     WHERE m.is_deleted = false
       AND m.user_id <> v_user_id
       AND m.created_at > mc.last_read_at
     GROUP BY m.channel_id
  ),
  last_msg AS (
    SELECT DISTINCT ON (m.channel_id)
           m.channel_id, m.content, m.created_at, m.type, m.user_id
      FROM public.messages m
     WHERE m.channel_id IN (SELECT channel_id FROM my_channels)
       AND m.is_deleted = false
     ORDER BY m.channel_id, m.created_at DESC
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.updated_at DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        c.id,
        c.name,
        c.description,
        c.type,
        c.created_by,
        c.created_at,
        c.updated_at,
        COALESCE(mc.member_count, 0) AS member_count,
        COALESCE(u.unread_count, 0) AS unread_count,
        CASE
          WHEN lm.channel_id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'content', lm.content,
            'created_at', lm.created_at,
            'type', lm.type,
            'user_name', COALESCE((SELECT full_name FROM public.profiles WHERE id = lm.user_id), '')
          )
        END AS last_message
      FROM public.channels c
      JOIN my_channels mch ON mch.channel_id = c.id
      LEFT JOIN member_counts mc ON mc.channel_id = c.id
      LEFT JOIN unread u ON u.channel_id = c.id
      LEFT JOIN last_msg lm ON lm.channel_id = c.id
    ) t;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_channels(UUID) TO authenticated;

-- ============================================
-- 3. 채널 삭제 시 chat-attachments 스토리지 자동 정리
--    storage.objects 에서 bucket_id='chat-attachments', name LIKE '{channel_id}/%' 삭제
-- ============================================
CREATE OR REPLACE FUNCTION public.cleanup_channel_storage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  DELETE FROM storage.objects
   WHERE bucket_id = 'chat-attachments'
     AND name LIKE OLD.id::text || '/%';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_channel_storage ON public.channels;
CREATE TRIGGER trg_cleanup_channel_storage
  BEFORE DELETE ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_channel_storage();
