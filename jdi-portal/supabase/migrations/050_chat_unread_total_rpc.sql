-- ============================================
-- 050_chat_unread_total_rpc.sql
-- 사이드바 전체 미읽음 뱃지 계산을 N+1 → 1 쿼리로
-- ============================================
CREATE OR REPLACE FUNCTION public.get_total_unread_count()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*), 0)::INT
    FROM public.messages m
    JOIN public.channel_members cm
      ON cm.channel_id = m.channel_id
     AND cm.user_id = auth.uid()
   WHERE cm.is_muted = false
     AND m.user_id <> auth.uid()
     AND m.is_deleted = false
     AND m.created_at > cm.last_read_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_total_unread_count() TO authenticated;
