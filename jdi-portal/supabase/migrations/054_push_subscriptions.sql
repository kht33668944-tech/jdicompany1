-- 054_push_subscriptions.sql
-- Web Push 알림: subscription 저장 + 알림 설정 확장 + 채널 활성 추적

-- ============================================================
-- 1. push_subscriptions 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user
  ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 본인 subscription만 조회/추가/삭제
CREATE POLICY "Users select own push_subscriptions"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own push_subscriptions"
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_approved_user());

CREATE POLICY "Users delete own push_subscriptions"
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 2. notification_settings 컬럼 추가
-- ============================================================
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS push_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS chat_message_notify BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.notification_settings.push_enabled IS
  '브라우저 푸시 알림 마스터 스위치. 사용자가 권한을 동의하고 켰을 때만 TRUE.';
COMMENT ON COLUMN public.notification_settings.chat_message_notify IS
  '채팅 메시지 푸시 수신 여부. push_enabled = TRUE 일 때만 의미 있음.';

-- ============================================================
-- 3. channel_members 활성 추적
-- ============================================================
ALTER TABLE public.channel_members
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.channel_members.last_seen_at IS
  '사용자가 마지막으로 이 채널을 보고 있다고 신고한 시각. 5초 이내면 active로 간주, push 발송 제외.';

CREATE INDEX IF NOT EXISTS idx_channel_members_last_seen
  ON public.channel_members(channel_id, last_seen_at);

-- ============================================================
-- 4. heartbeat RPC — 채팅방 보고 있는 동안 5초마다 호출
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_channel_seen(p_channel_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.channel_members
  SET last_seen_at = NOW()
  WHERE channel_id = p_channel_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_channel_seen(UUID) TO authenticated;
