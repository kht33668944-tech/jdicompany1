-- ============================================
-- 037_chat_create_channel_rpc.sql
-- 채널 생성 RPC (SECURITY DEFINER로 RLS 우회)
-- ============================================

CREATE OR REPLACE FUNCTION public.create_chat_channel(
  p_name TEXT,
  p_description TEXT DEFAULT '',
  p_type TEXT DEFAULT 'group',
  p_member_ids UUID[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_channel_id UUID;
  v_member_id UUID;
BEGIN
  -- 인증 확인
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 승인 확인
  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'User not approved';
  END IF;

  -- 채널 생성
  INSERT INTO channels (name, description, type, created_by)
  VALUES (p_name, p_description, p_type, v_user_id)
  RETURNING id INTO v_channel_id;

  -- 생성자를 owner로 추가
  INSERT INTO channel_members (channel_id, user_id, role)
  VALUES (v_channel_id, v_user_id, 'owner');

  -- 추가 멤버 초대
  FOREACH v_member_id IN ARRAY p_member_ids
  LOOP
    IF v_member_id != v_user_id THEN
      INSERT INTO channel_members (channel_id, user_id, role)
      VALUES (v_channel_id, v_member_id, 'member');
    END IF;
  END LOOP;

  RETURN v_channel_id;
END;
$$;
