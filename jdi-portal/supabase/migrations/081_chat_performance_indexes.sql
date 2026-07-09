-- Chat performance indexes for high-volume rooms.
-- These are intentionally non-destructive and safe to re-run.

CREATE INDEX IF NOT EXISTS idx_messages_visible_channel_created_desc
  ON public.messages (channel_id, created_at DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_messages_visible_channel_type_created_desc
  ON public.messages (channel_id, type, created_at DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_channel_members_user_channel_read
  ON public.channel_members (user_id, channel_id, last_read_at)
  INCLUDE (is_muted, is_favorite);

CREATE INDEX IF NOT EXISTS idx_messages_visible_pinned_channel
  ON public.messages (channel_id, pinned_at DESC)
  WHERE is_deleted = false AND is_pinned = true;
