-- ============================================
-- 045_chat_realtime_publication.sql
-- 누락된 채널 메타 실시간 + DELETE 이벤트 전체 row 전송
--   - channels 테이블을 supabase_realtime publication에 추가 (#1 채널 이름/설명 실시간)
--   - channel_members REPLICA IDENTITY FULL (#2 DELETE 시 channel_id 포함)
--   - channels REPLICA IDENTITY FULL (안전: 채널 삭제 시 전체 row 수신)
-- ============================================

-- 1. channels 를 publication에 추가 (이미 있으면 무시)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'channels'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
  END IF;
END $$;

-- 2. channel_members REPLICA IDENTITY FULL
ALTER TABLE public.channel_members REPLICA IDENTITY FULL;

-- 3. channels REPLICA IDENTITY FULL
ALTER TABLE public.channels REPLICA IDENTITY FULL;
