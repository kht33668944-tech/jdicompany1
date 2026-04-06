-- ============================================
-- 041_chat_favorite.sql
-- 채널 즐겨찾기
-- ============================================

ALTER TABLE public.channel_members ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;
