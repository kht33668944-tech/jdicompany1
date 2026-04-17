-- ============================================
-- 071_chat_remove_storage_cleanup_trigger.sql
-- 채널 삭제 시 storage.objects 자동 정리 트리거 제거
--   - Supabase가 storage.objects 직접 DELETE를 차단함
--     (에러: "Direct deletion from storage tables is not allowed")
--   - 채널 삭제 자체를 막고 있어서 제거
--   - 파일 정리는 클라이언트가 Storage API 로 수행
-- ============================================

DROP TRIGGER IF EXISTS trg_cleanup_channel_storage ON public.channels;
DROP FUNCTION IF EXISTS public.cleanup_channel_storage();
