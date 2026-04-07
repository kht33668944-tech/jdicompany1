-- ============================================
-- 051_chat_messages_rpc.sql
-- 채팅 메시지 단일 RPC 조회 (성능 개선)
--   - 기존: messages SELECT → user_id 모은 뒤 profiles SELECT (2 round-trip)
--   - 변경: get_channel_messages RPC 1회 — JSONB 배열로 user_profile 임베드 반환
-- 보안:
--   - SECURITY DEFINER 이지만 함수 본문에서 멤버 권한 + is_approved_user 체크
-- ============================================

CREATE OR REPLACE FUNCTION public.get_channel_messages(
  p_channel_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 승인된 사용자만 (RLS 와 동일한 가드)
  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- 채널 멤버만
  IF NOT EXISTS (
    SELECT 1 FROM public.channel_members
     WHERE channel_id = p_channel_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- 최신 N개를 가져온 뒤 시간순(오래된 것이 위)으로 정렬
  WITH page AS (
    SELECT m.*
      FROM public.messages m
     WHERE m.channel_id = p_channel_id
       AND (p_cursor IS NULL OR m.created_at < p_cursor)
     ORDER BY m.created_at DESC
     LIMIT p_limit
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at ASC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        p.id,
        p.channel_id,
        p.user_id,
        p.content,
        p.type,
        p.is_edited,
        p.is_deleted,
        p.is_pinned,
        p.pinned_by,
        p.pinned_at,
        p.parent_message_id,
        p.created_at,
        p.updated_at,
        CASE
          WHEN pr.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'full_name', pr.full_name,
            'avatar_url', pr.avatar_url
          )
        END AS user_profile
      FROM page p
      LEFT JOIN public.profiles pr ON pr.id = p.user_id
    ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_channel_messages(UUID, TIMESTAMPTZ, INT) TO authenticated;
