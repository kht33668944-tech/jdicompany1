-- ============================================
-- 069_chat_dm.sql — 1:1 DM 채널 타입 + 직원 리스트 사이드바 지원
-- ============================================

-- 1. channels.type 에 'dm' 추가 ---------------------------------
ALTER TABLE public.channels DROP CONSTRAINT IF EXISTS channels_type_check;
ALTER TABLE public.channels
  ADD CONSTRAINT channels_type_check
  CHECK (type IN ('group', 'memo', 'dm'));

-- 2. dm_pair_key 컬럼 + 유일 인덱스 ------------------------------
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS dm_pair_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_pair_key
  ON public.channels(dm_pair_key)
  WHERE type = 'dm' AND dm_pair_key IS NOT NULL;

-- 3. open_or_create_dm RPC -------------------------------------
CREATE OR REPLACE FUNCTION public.open_or_create_dm(p_target_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_pair_key TEXT;
  v_channel_id UUID;
  v_target_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'User not approved';
  END IF;
  IF p_target_user_id IS NULL OR p_target_user_id = v_user_id THEN
    RAISE EXCEPTION 'Invalid target user';
  END IF;

  SELECT full_name INTO v_target_name
    FROM public.profiles
   WHERE id = p_target_user_id AND is_approved = true;
  IF v_target_name IS NULL THEN
    RAISE EXCEPTION 'Target user not approved';
  END IF;

  v_pair_key := CASE
    WHEN v_user_id < p_target_user_id
      THEN v_user_id::text || '_' || p_target_user_id::text
    ELSE p_target_user_id::text || '_' || v_user_id::text
  END;

  SELECT id INTO v_channel_id
    FROM public.channels
   WHERE type = 'dm' AND dm_pair_key = v_pair_key;

  IF v_channel_id IS NOT NULL THEN
    RETURN v_channel_id;
  END IF;

  BEGIN
    INSERT INTO public.channels (name, description, type, created_by, dm_pair_key)
      VALUES ('', '', 'dm', v_user_id, v_pair_key)
      RETURNING id INTO v_channel_id;

    INSERT INTO public.channel_members (channel_id, user_id, role)
      VALUES
        (v_channel_id, v_user_id, 'owner'),
        (v_channel_id, p_target_user_id, 'member');
  EXCEPTION WHEN unique_violation THEN
    -- 동시 호출로 다른 트랜잭션이 먼저 채널을 만들었다면 그 채널 반환
    SELECT id INTO v_channel_id
      FROM public.channels
     WHERE type = 'dm' AND dm_pair_key = v_pair_key;
  END;

  RETURN v_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_or_create_dm(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_or_create_dm(UUID) TO authenticated;

-- 4. get_user_channels 확장: members_preview + dm_partner_id ----
CREATE OR REPLACE FUNCTION public.get_user_channels(p_user_id UUID DEFAULT NULL)
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
  IF p_user_id IS NOT NULL AND p_user_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden: cannot query channels for other users';
  END IF;

  WITH my_channels AS (
    SELECT cm.channel_id, cm.last_read_at, cm.is_muted, cm.is_favorite
      FROM public.channel_members cm
     WHERE cm.user_id = v_user_id
  ),
  member_counts AS (
    SELECT channel_id, COUNT(*)::INT AS member_count
      FROM public.channel_members
     WHERE channel_id IN (SELECT channel_id FROM my_channels)
     GROUP BY channel_id
  ),
  unread AS (
    SELECT m.channel_id, COUNT(*)::INT AS unread_count
      FROM public.messages m
      JOIN my_channels mc ON mc.channel_id = m.channel_id
     WHERE m.is_deleted = false
       AND m.user_id <> v_user_id
       AND m.created_at > mc.last_read_at
     GROUP BY m.channel_id
  ),
  last_msg AS (
    SELECT DISTINCT ON (m.channel_id)
           m.channel_id, m.content, m.created_at, m.type, m.user_id
      FROM public.messages m
     WHERE m.channel_id IN (SELECT channel_id FROM my_channels)
       AND m.is_deleted = false
     ORDER BY m.channel_id, m.created_at DESC
  ),
  members_preview AS (
    SELECT cm.channel_id,
           jsonb_agg(
             jsonb_build_object(
               'id', p.id,
               'full_name', p.full_name,
               'avatar_url', p.avatar_url
             )
             ORDER BY cm.joined_at
           ) FILTER (WHERE p.id IS NOT NULL AND cm.user_id <> v_user_id) AS items
      FROM public.channel_members cm
      JOIN public.profiles p ON p.id = cm.user_id
     WHERE cm.channel_id IN (SELECT channel_id FROM my_channels)
     GROUP BY cm.channel_id
  ),
  dm_partner AS (
    SELECT cm.channel_id, cm.user_id AS partner_id
      FROM public.channel_members cm
      JOIN public.channels c ON c.id = cm.channel_id
     WHERE c.type = 'dm'
       AND cm.user_id <> v_user_id
       AND cm.channel_id IN (SELECT channel_id FROM my_channels)
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.updated_at DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        c.id,
        c.name,
        c.description,
        c.type,
        c.created_by,
        c.created_at,
        c.updated_at,
        COALESCE(mc.member_count, 0) AS member_count,
        COALESCE(u.unread_count, 0) AS unread_count,
        CASE
          WHEN lm.channel_id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'content', lm.content,
            'created_at', lm.created_at,
            'type', lm.type,
            'user_name', COALESCE((SELECT full_name FROM public.profiles WHERE id = lm.user_id), '')
          )
        END AS last_message,
        COALESCE(mp.items, '[]'::jsonb) AS members_preview,
        dp.partner_id AS dm_partner_id
      FROM public.channels c
      JOIN my_channels mch ON mch.channel_id = c.id
      LEFT JOIN member_counts mc ON mc.channel_id = c.id
      LEFT JOIN unread u ON u.channel_id = c.id
      LEFT JOIN last_msg lm ON lm.channel_id = c.id
      LEFT JOIN members_preview mp ON mp.channel_id = c.id
      LEFT JOIN dm_partner dp ON dp.channel_id = c.id
    ) t;

  RETURN v_result;
END;
$$;

-- 5. 멘션 알림 트리거 -----------------------------------------
CREATE OR REPLACE FUNCTION public.handle_message_mention_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
  v_sender_name TEXT;
  v_channel_name TEXT;
  v_channel_type TEXT;
BEGIN
  IF NEW.type <> 'text' OR NEW.is_deleted THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_sender_name FROM public.profiles WHERE id = NEW.user_id;
  SELECT name, type INTO v_channel_name, v_channel_type FROM public.channels WHERE id = NEW.channel_id;

  BEGIN
    FOR v_token IN
      SELECT DISTINCT (regexp_matches(NEW.content, '@\[[^|\]]+\|([0-9a-f-]{36})\]', 'g'))[1]::uuid AS mentioned_user
    LOOP
      IF v_token.mentioned_user = NEW.user_id THEN
        CONTINUE;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.channel_members
         WHERE channel_id = NEW.channel_id AND user_id = v_token.mentioned_user
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
      VALUES (
        v_token.mentioned_user,
        'chat_mention',
        COALESCE(v_sender_name, '누군가') || '님이 회원님을 언급했습니다',
        regexp_replace(substring(NEW.content from 1 for 200), '@\[([^|\]]+)\|[0-9a-f-]{36}\]', '@\1', 'g'),
        '/dashboard/chat/' || NEW.channel_id::text,
        jsonb_build_object('channel_id', NEW.channel_id, 'message_id', NEW.id)
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- 알림 실패는 메시지 전송을 막지 않는다
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_mention_notify ON public.messages;
CREATE TRIGGER trg_message_mention_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_message_mention_notify();
