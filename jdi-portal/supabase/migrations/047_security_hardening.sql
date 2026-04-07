-- ============================================
-- 047_security_hardening.sql
-- Phase 1 보안 강화
--   1. get_user_channels / get_my_tasks_with_details RPC 권한 우회 차단
--   2. chat-attachments 스토리지: 채널 멤버십 검증
--   3. task_attachments INSERT: 작성자/담당자/admin 만
--   4. task-attachments 스토리지: task 권한 기반
--   5. reports 스토리지: report 권한 기반
--   6. schedule_participants SELECT: 본인/생성자/admin
-- ============================================

-- ============================================
-- 1-a. get_user_channels: p_user_id 무시 — 항상 auth.uid() 사용
--      (admin 이라도 타인의 채널 목록을 RPC 로 조회할 수 없도록 차단)
-- ============================================
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

  -- 호출자가 다른 사용자의 ID 를 넘기는 것을 차단
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
        END AS last_message
      FROM public.channels c
      JOIN my_channels mch ON mch.channel_id = c.id
      LEFT JOIN member_counts mc ON mc.channel_id = c.id
      LEFT JOIN unread u ON u.channel_id = c.id
      LEFT JOIN last_msg lm ON lm.channel_id = c.id
    ) t;

  RETURN v_result;
END;
$$;

-- ============================================
-- 1-b. get_my_tasks_with_details: p_user_id 무시 — 항상 auth.uid() 사용
-- ============================================
CREATE OR REPLACE FUNCTION public.get_my_tasks_with_details(
  p_user_id UUID DEFAULT NULL,
  p_include_completed BOOLEAN DEFAULT true,
  p_completed_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_cutoff TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 호출자가 다른 사용자의 ID 를 넘기는 것을 차단
  IF p_user_id IS NOT NULL AND p_user_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden: cannot query tasks for other users';
  END IF;

  v_cutoff := now() - (p_completed_days || ' days')::INTERVAL;

  WITH my_task_ids AS (
    SELECT DISTINCT t.id
      FROM public.tasks t
      JOIN public.task_assignees ta ON ta.task_id = t.id
     WHERE ta.user_id = v_user_id
       AND (
         t.status IN ('대기', '진행중')
         OR (p_include_completed AND t.status = '완료' AND t.updated_at >= v_cutoff)
       )
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.position), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        t.id, t.title, t.description, t.status, t.priority, t.category,
        t.due_date, t.start_date, t.position, t.parent_id, t.created_by,
        t.created_at, t.updated_at,
        (SELECT row_to_json(p) FROM (SELECT full_name, avatar_url FROM public.profiles WHERE id = t.created_by) p) AS creator_profile,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'user_id', ta.user_id,
            'full_name', p.full_name,
            'avatar_url', p.avatar_url
          ))
          FROM public.task_assignees ta
          JOIN public.profiles p ON p.id = ta.user_id
          WHERE ta.task_id = t.id
        ), '[]'::jsonb) AS assignees,
        COALESCE((SELECT COUNT(*)::INT FROM public.task_activities a WHERE a.task_id = t.id AND a.type='comment'), 0) AS comment_count,
        COALESCE((SELECT COUNT(*)::INT FROM public.task_attachments at WHERE at.task_id = t.id), 0) AS attachment_count,
        COALESCE((SELECT COUNT(*)::INT FROM public.tasks st WHERE st.parent_id = t.id), 0) AS subtask_count,
        COALESCE((SELECT COUNT(*)::INT FROM public.task_checklist_items ci WHERE ci.task_id = t.id), 0) AS checklist_total,
        COALESCE((SELECT COUNT(*)::INT FROM public.task_checklist_items ci WHERE ci.task_id = t.id AND ci.is_completed), 0) AS checklist_completed
      FROM public.tasks t
      WHERE t.id IN (SELECT id FROM my_task_ids)
    ) x;

  RETURN v_result;
END;
$$;

-- ============================================
-- 2. chat-attachments 스토리지: 채널 멤버십 검증
--    경로 규칙: "{channel_id}/{filename}"
--    (035_chat.sql 의 단순 is_approved_user 정책을 교체)
-- ============================================
DROP POLICY IF EXISTS "chat_attachments_select" ON storage.objects;
CREATE POLICY "chat_attachments_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND public.is_approved_user()
  AND EXISTS (
    SELECT 1 FROM public.channel_members cm
     WHERE cm.user_id = auth.uid()
       AND cm.channel_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS "chat_attachments_insert" ON storage.objects;
CREATE POLICY "chat_attachments_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND public.is_approved_user()
  AND EXISTS (
    SELECT 1 FROM public.channel_members cm
     WHERE cm.user_id = auth.uid()
       AND cm.channel_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS "chat_attachments_delete" ON storage.objects;
CREATE POLICY "chat_attachments_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND public.is_approved_user()
  AND EXISTS (
    SELECT 1 FROM public.channel_members cm
     WHERE cm.user_id = auth.uid()
       AND cm.channel_id::text = (storage.foldername(name))[1]
  )
);

-- ============================================
-- 3. task_attachments INSERT: 작성자/담당자/admin 만 첨부 가능
--    (034 의 정책은 단순히 user_id = auth.uid() 만 검사)
-- ============================================
DROP POLICY IF EXISTS "Approved users can upload attachments" ON public.task_attachments;
CREATE POLICY "Approved task members can upload attachments"
  ON public.task_attachments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user()
    AND user_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
      OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = task_id AND ta.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ============================================
-- 4. task-attachments 스토리지: task 권한 기반으로 교체
--    경로 규칙: "{task_id}/{uuid}.ext"
--    (030 은 첫 폴더가 auth.uid() 여야 함 — 실제 경로와 불일치)
-- ============================================
DROP POLICY IF EXISTS "Approved users can view task attachments" ON storage.objects;
CREATE POLICY "Approved task members can view task attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND public.is_approved_user()
  );
-- 주: SELECT 는 task_attachments RLS 와 signed URL 접근을 위해 승인 사용자 전체 허용 유지
-- (DB 레벨에서 task_attachments SELECT 가 막혀 있으면 path 도 노출되지 않음)

DROP POLICY IF EXISTS "Approved users can delete own task attachments" ON storage.objects;
CREATE POLICY "Approved task members can delete task attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND public.is_approved_user()
    AND (
      -- 업로더 본인 (task_attachments 메타데이터로 확인)
      EXISTS (
        SELECT 1 FROM public.task_attachments a
         WHERE a.file_path = name AND a.user_id = auth.uid()
      )
      -- 또는 task 작성자
      OR EXISTS (
        SELECT 1 FROM public.task_attachments a
         JOIN public.tasks t ON t.id = a.task_id
         WHERE a.file_path = name AND t.created_by = auth.uid()
      )
      -- 또는 관리자
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- task_attachments DB 정책도 동일하게 조정 (UI 의 canEdit 와 일치)
DROP POLICY IF EXISTS "Approved uploader or admin can delete attachments" ON public.task_attachments;
CREATE POLICY "Approved task members can delete attachments"
  ON public.task_attachments FOR DELETE TO authenticated
  USING (
    public.is_approved_user() AND (
      user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ============================================
-- 5. reports 스토리지: report 권한 기반으로 교체
--    경로 규칙: "{report_id}/{uuid}.ext"
-- ============================================
DROP POLICY IF EXISTS "Approved users can delete own report files" ON storage.objects;
CREATE POLICY "Approved report authors can delete report files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'reports'
    AND public.is_approved_user()
    AND (
      EXISTS (
        SELECT 1 FROM public.report_attachments a
         JOIN public.reports r ON r.id = a.report_id
         WHERE a.file_path = name AND r.user_id = auth.uid()
      )
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ============================================
-- 6. schedule_participants SELECT: 본인/생성자/admin 으로 좁힘
--    (034 는 모든 승인 사용자에게 열려 있어 사생활 정보 노출)
-- ============================================
DROP POLICY IF EXISTS "Approved users can view participants" ON public.schedule_participants;
CREATE POLICY "Approved members can view participants"
  ON public.schedule_participants FOR SELECT TO authenticated
  USING (
    public.is_approved_user() AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.schedules s
         WHERE s.id = schedule_id AND s.created_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.schedules s
         WHERE s.id = schedule_id AND s.visibility = 'company'
      )
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );
