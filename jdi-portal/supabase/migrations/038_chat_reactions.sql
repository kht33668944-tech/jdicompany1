-- ============================================
-- 038_chat_reactions.sql
-- 메시지 이모지 리액션
-- ============================================

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- 인덱스
CREATE INDEX idx_reactions_message ON public.message_reactions(message_id);

-- RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions_select" ON public.message_reactions
  FOR SELECT USING (public.is_approved_user());

CREATE POLICY "reactions_insert" ON public.message_reactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND public.is_approved_user()
  );

CREATE POLICY "reactions_delete" ON public.message_reactions
  FOR DELETE USING (
    auth.uid() = user_id AND public.is_approved_user()
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
