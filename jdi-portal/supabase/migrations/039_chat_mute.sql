-- ============================================
-- 039_chat_mute.sql
-- 채널 알림 음소거
-- ============================================

ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT false;
