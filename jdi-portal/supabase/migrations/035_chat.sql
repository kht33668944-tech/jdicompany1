-- ============================================
-- 035_chat.sql — 채팅 기능 테이블 + RLS + 인덱스
-- ============================================

-- 1. channels 테이블
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'group' CHECK (type IN ('group', 'memo')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

-- 메모 채널은 사용자당 1개만 허용
CREATE UNIQUE INDEX idx_memo_channel_per_user ON channels(created_by) WHERE type = 'memo';

-- 2. channel_members 테이블
CREATE TABLE channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

-- 3. messages 테이블
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'file', 'image', 'system')),
  is_edited BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  parent_message_id UUID REFERENCES messages(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 4. message_attachments 테이블 (Phase 2에서 본격 사용)
CREATE TABLE message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;

-- 5. message_reads 테이블
CREATE TABLE message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 인덱스
-- ============================================

-- 메시지 조회 (채널별 최신순)
CREATE INDEX idx_messages_channel_created ON messages(channel_id, created_at DESC);

-- 읽지 않은 메시지 수 계산
CREATE INDEX idx_messages_channel_created_asc ON messages(channel_id, created_at);

-- 읽음 확인
CREATE INDEX idx_message_reads_message ON message_reads(message_id);

-- 멤버 조회
CREATE INDEX idx_channel_members_user ON channel_members(user_id);
CREATE INDEX idx_channel_members_channel ON channel_members(channel_id);

-- 첨부파일 조회 (서랍 기능용)
CREATE INDEX idx_attachments_message ON message_attachments(message_id);

-- ============================================
-- RLS 정책: channels
-- ============================================

-- SELECT: 자신이 멤버인 채널 또는 본인 메모 채널
CREATE POLICY "channels_select" ON channels FOR SELECT USING (
  public.is_approved_user() AND (
    (type = 'memo' AND created_by = auth.uid())
    OR
    EXISTS (SELECT 1 FROM channel_members WHERE channel_id = channels.id AND user_id = auth.uid())
  )
);

-- INSERT: 승인된 사용자 누구나 생성
CREATE POLICY "channels_insert" ON channels FOR INSERT WITH CHECK (
  public.is_approved_user() AND created_by = auth.uid()
);

-- UPDATE: 채널 멤버만 수정
CREATE POLICY "channels_update" ON channels FOR UPDATE USING (
  public.is_approved_user() AND
  EXISTS (SELECT 1 FROM channel_members WHERE channel_id = channels.id AND user_id = auth.uid())
);

-- DELETE: 생성자만 삭제
CREATE POLICY "channels_delete" ON channels FOR DELETE USING (
  public.is_approved_user() AND created_by = auth.uid()
);

-- ============================================
-- RLS 정책: channel_members
-- ============================================

-- SELECT: 같은 채널 멤버끼리 조회
CREATE POLICY "channel_members_select" ON channel_members FOR SELECT USING (
  public.is_approved_user() AND
  EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = channel_members.channel_id AND cm.user_id = auth.uid())
);

-- INSERT: 같은 채널 멤버가 추가 가능 (또는 채널 생성자가 첫 멤버 추가)
CREATE POLICY "channel_members_insert" ON channel_members FOR INSERT WITH CHECK (
  public.is_approved_user() AND (
    -- 채널 생성자가 초기 멤버 추가
    EXISTS (SELECT 1 FROM channels WHERE id = channel_members.channel_id AND created_by = auth.uid())
    OR
    -- 기존 멤버가 새 멤버 초대
    EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = channel_members.channel_id AND cm.user_id = auth.uid())
  )
);

-- UPDATE: 본인 레코드만 수정 (last_read_at 갱신)
CREATE POLICY "channel_members_update" ON channel_members FOR UPDATE USING (
  public.is_approved_user() AND user_id = auth.uid()
);

-- DELETE: 채널 멤버가 다른 멤버 제거 가능
CREATE POLICY "channel_members_delete" ON channel_members FOR DELETE USING (
  public.is_approved_user() AND
  EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = channel_members.channel_id AND cm.user_id = auth.uid())
);

-- ============================================
-- RLS 정책: messages
-- ============================================

-- SELECT: 채널 멤버만 메시지 조회
CREATE POLICY "messages_select" ON messages FOR SELECT USING (
  public.is_approved_user() AND
  EXISTS (SELECT 1 FROM channel_members WHERE channel_id = messages.channel_id AND user_id = auth.uid())
);

-- INSERT: 채널 멤버만 메시지 작성
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (
  public.is_approved_user() AND
  user_id = auth.uid() AND
  EXISTS (SELECT 1 FROM channel_members WHERE channel_id = messages.channel_id AND user_id = auth.uid())
);

-- UPDATE: 본인 메시지만 수정
CREATE POLICY "messages_update" ON messages FOR UPDATE USING (
  public.is_approved_user() AND user_id = auth.uid()
);

-- DELETE는 사용하지 않음 (soft delete via is_deleted)

-- ============================================
-- RLS 정책: message_attachments
-- ============================================

-- SELECT: 채널 멤버만 첨부파일 조회
CREATE POLICY "message_attachments_select" ON message_attachments FOR SELECT USING (
  public.is_approved_user() AND
  EXISTS (
    SELECT 1 FROM messages m
    JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = auth.uid()
    WHERE m.id = message_attachments.message_id
  )
);

-- INSERT: 채널 멤버만 첨부파일 추가
CREATE POLICY "message_attachments_insert" ON message_attachments FOR INSERT WITH CHECK (
  public.is_approved_user() AND
  EXISTS (
    SELECT 1 FROM messages m
    JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = auth.uid()
    WHERE m.id = message_attachments.message_id AND m.user_id = auth.uid()
  )
);

-- DELETE: 본인 메시지의 첨부파일만 삭제
CREATE POLICY "message_attachments_delete" ON message_attachments FOR DELETE USING (
  public.is_approved_user() AND
  EXISTS (
    SELECT 1 FROM messages m WHERE m.id = message_attachments.message_id AND m.user_id = auth.uid()
  )
);

-- ============================================
-- RLS 정책: message_reads
-- ============================================

-- SELECT: 같은 채널 멤버끼리 읽음 기록 조회
CREATE POLICY "message_reads_select" ON message_reads FOR SELECT USING (
  public.is_approved_user() AND
  EXISTS (
    SELECT 1 FROM messages m
    JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = auth.uid()
    WHERE m.id = message_reads.message_id
  )
);

-- INSERT: 본인 읽음 기록만 추가
CREATE POLICY "message_reads_insert" ON message_reads FOR INSERT WITH CHECK (
  public.is_approved_user() AND user_id = auth.uid()
);

-- ============================================
-- Realtime 발행
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE channel_members;

-- ============================================
-- Storage 버킷 (Phase 2에서 본격 사용)
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: 채널 멤버만 해당 채널 파일 접근
CREATE POLICY "chat_attachments_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'chat-attachments' AND public.is_approved_user()
);

CREATE POLICY "chat_attachments_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'chat-attachments' AND public.is_approved_user()
);

CREATE POLICY "chat_attachments_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'chat-attachments' AND public.is_approved_user()
);
