-- ============================================
-- 040_chat_pin.sql
-- 메시지 고정 (Pin)
-- ============================================

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS pinned_by UUID;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
