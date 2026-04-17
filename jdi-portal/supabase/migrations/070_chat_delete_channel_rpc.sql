-- ============================================
-- 070_chat_delete_channel_rpc.sql
-- 채널 삭제를 SECURITY DEFINER RPC로 전환
--   - 기존 .delete()는 RLS 침묵 실패 시 에러 없이 0 rows 반환 → 사용자가 원인 파악 불가
--   - RPC 에서 명시적 권한 체크 + 명확한 예외 발생
-- ============================================

-- 1. parent_message_id FK를 ON DELETE CASCADE 로 변경 (예방적)
--    채널 CASCADE 삭제 시 parent 관계로 인한 충돌 방지
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_parent_message_id_fkey;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_parent_message_id_fkey
  FOREIGN KEY (parent_message_id)
  REFERENCES public.messages(id)
  ON DELETE CASCADE;

-- 2. delete_chat_channel RPC
CREATE OR REPLACE FUNCTION public.delete_chat_channel(p_channel_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_channel RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다';
  END IF;

  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION '승인된 사용자만 사용 가능합니다';
  END IF;

  SELECT id, type, created_by INTO v_channel
    FROM public.channels
   WHERE id = p_channel_id;

  IF v_channel.id IS NULL THEN
    RAISE EXCEPTION '채널을 찾을 수 없습니다';
  END IF;

  IF v_channel.type = 'memo' THEN
    RAISE EXCEPTION '메모 채널은 삭제할 수 없습니다';
  END IF;

  IF v_channel.created_by <> v_user_id THEN
    RAISE EXCEPTION '채널 생성자만 삭제할 수 있습니다';
  END IF;

  DELETE FROM public.channels WHERE id = p_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_chat_channel(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_chat_channel(UUID) TO authenticated;
