-- ============================================
-- 042_chat_memo_single_user.sql
-- "나만의 메모"를 단일 사용자 전용 채널로 강제
--   - memo 채널에는 owner 1명 외 멤버 추가 불가
--   - memo 채널은 삭제/이름 변경 외 멤버 변경 불가
--   - create_chat_channel RPC가 memo 타입일 때 p_member_ids 무시
-- ============================================

-- 0. 기존 데이터 청소 (트리거 설치 전)
--    memo 채널에 잘못 들어간 멤버 + 시스템 메시지 정리
DELETE FROM public.message_reads
WHERE message_id IN (
  SELECT m.id FROM public.messages m
  JOIN public.channels c ON c.id = m.channel_id
  WHERE c.type = 'memo' AND m.user_id <> c.created_by
);

DELETE FROM public.message_reactions
WHERE message_id IN (
  SELECT m.id FROM public.messages m
  JOIN public.channels c ON c.id = m.channel_id
  WHERE c.type = 'memo' AND m.user_id <> c.created_by
);

DELETE FROM public.message_attachments
WHERE message_id IN (
  SELECT m.id FROM public.messages m
  JOIN public.channels c ON c.id = m.channel_id
  WHERE c.type = 'memo' AND m.user_id <> c.created_by
);

-- memo 채널에 다른 사용자가 남긴 메시지 삭제 (시스템 초대 메시지 포함)
DELETE FROM public.messages
WHERE channel_id IN (SELECT id FROM public.channels WHERE type = 'memo')
  AND (
    user_id <> (SELECT created_by FROM public.channels WHERE id = messages.channel_id)
    OR type = 'system'
  );

-- memo 채널의 owner가 아닌 멤버 제거
DELETE FROM public.channel_members cm
USING public.channels c
WHERE cm.channel_id = c.id
  AND c.type = 'memo'
  AND cm.user_id <> c.created_by;

-- 1. memo 채널 멤버 추가 차단 트리거
CREATE OR REPLACE FUNCTION public.enforce_memo_single_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_type TEXT;
  v_existing_count INT;
BEGIN
  SELECT type INTO v_channel_type FROM public.channels WHERE id = NEW.channel_id;
  IF v_channel_type IS DISTINCT FROM 'memo' THEN
    RETURN NEW;
  END IF;

  -- memo 채널: owner는 채널 생성자 본인만 허용, 기존 멤버 있으면 거부
  SELECT COUNT(*) INTO v_existing_count
  FROM public.channel_members
  WHERE channel_id = NEW.channel_id;

  IF v_existing_count > 0 THEN
    RAISE EXCEPTION '메모 채널에는 멤버를 추가할 수 없습니다.';
  END IF;

  -- 첫 멤버는 반드시 채널 생성자여야 함
  IF NEW.user_id <> (SELECT created_by FROM public.channels WHERE id = NEW.channel_id) THEN
    RAISE EXCEPTION '메모 채널은 본인만 사용할 수 있습니다.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_memo_single_member ON public.channel_members;
CREATE TRIGGER trg_enforce_memo_single_member
BEFORE INSERT ON public.channel_members
FOR EACH ROW
EXECUTE FUNCTION public.enforce_memo_single_member();

-- 2. memo 채널 멤버 삭제 차단 (자기 자신도 못 나감)
CREATE OR REPLACE FUNCTION public.block_memo_member_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_type TEXT;
BEGIN
  SELECT type INTO v_channel_type FROM public.channels WHERE id = OLD.channel_id;
  IF v_channel_type = 'memo' THEN
    RAISE EXCEPTION '메모 채널의 멤버는 제거할 수 없습니다.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_memo_member_delete ON public.channel_members;
CREATE TRIGGER trg_block_memo_member_delete
BEFORE DELETE ON public.channel_members
FOR EACH ROW
EXECUTE FUNCTION public.block_memo_member_delete();

-- 3. create_chat_channel RPC: memo 타입이면 p_member_ids 강제 무시
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

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

  -- memo 타입이면 추가 멤버 무시
  IF p_type = 'memo' THEN
    RETURN v_channel_id;
  END IF;

  -- 추가 멤버 초대
  FOREACH v_member_id IN ARRAY p_member_ids
  LOOP
    IF v_member_id <> v_user_id THEN
      INSERT INTO channel_members (channel_id, user_id, role)
      VALUES (v_channel_id, v_member_id, 'member');
    END IF;
  END LOOP;

  RETURN v_channel_id;
END;
$$;
