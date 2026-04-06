-- ============================================
-- 036_chat_fix_rls.sql — channel_members RLS 무한 재귀 수정
-- ============================================

-- channel_members의 자기참조 RLS 정책을 수정
-- SECURITY DEFINER 함수로 멤버십 확인 (RLS 우회)

CREATE OR REPLACE FUNCTION public.is_channel_member(p_channel_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = p_channel_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 기존 정책 삭제
DROP POLICY IF EXISTS "channel_members_select" ON channel_members;
DROP POLICY IF EXISTS "channel_members_insert" ON channel_members;
DROP POLICY IF EXISTS "channel_members_delete" ON channel_members;

-- 새 정책: 본인 레코드 직접 접근 + 같은 채널 멤버 조회 (함수 사용)
CREATE POLICY "channel_members_select" ON channel_members FOR SELECT USING (
  public.is_approved_user() AND (
    user_id = auth.uid()
    OR
    public.is_channel_member(channel_id)
  )
);

-- INSERT: 채널 생성자 또는 기존 멤버가 추가 가능
CREATE POLICY "channel_members_insert" ON channel_members FOR INSERT WITH CHECK (
  public.is_approved_user() AND (
    EXISTS (SELECT 1 FROM channels WHERE id = channel_members.channel_id AND created_by = auth.uid())
    OR
    public.is_channel_member(channel_members.channel_id)
  )
);

-- DELETE: 기존 멤버가 다른 멤버 제거 가능
CREATE POLICY "channel_members_delete" ON channel_members FOR DELETE USING (
  public.is_approved_user() AND
  public.is_channel_member(channel_members.channel_id)
);

-- messages 정책도 같은 패턴으로 수정 (안전하게)
DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;

CREATE POLICY "messages_select" ON messages FOR SELECT USING (
  public.is_approved_user() AND
  public.is_channel_member(channel_id)
);

CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (
  public.is_approved_user() AND
  user_id = auth.uid() AND
  public.is_channel_member(channel_id)
);

-- message_reads 정책도 수정
DROP POLICY IF EXISTS "message_reads_select" ON message_reads;

CREATE POLICY "message_reads_select" ON message_reads FOR SELECT USING (
  public.is_approved_user() AND
  EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = message_reads.message_id
    AND public.is_channel_member(m.channel_id)
  )
);

-- message_attachments 정책도 수정
DROP POLICY IF EXISTS "message_attachments_select" ON message_attachments;
DROP POLICY IF EXISTS "message_attachments_insert" ON message_attachments;

CREATE POLICY "message_attachments_select" ON message_attachments FOR SELECT USING (
  public.is_approved_user() AND
  EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = message_attachments.message_id
    AND public.is_channel_member(m.channel_id)
  )
);

CREATE POLICY "message_attachments_insert" ON message_attachments FOR INSERT WITH CHECK (
  public.is_approved_user() AND
  EXISTS (
    SELECT 1 FROM messages m
    WHERE m.id = message_attachments.message_id
    AND m.user_id = auth.uid()
    AND public.is_channel_member(m.channel_id)
  )
);
