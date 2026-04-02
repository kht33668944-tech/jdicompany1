-- 016: 할일 탭 리디자인 - DB 스키마 확장
-- 신규 테이블: task_assignees, task_checklist_items, task_attachments, task_activities
-- 기존 테이블 변경: tasks (parent_id, start_date 추가)
-- 마이그레이션: task_comments → task_activities, assigned_to → task_assignees

-- ============================================================
-- 1. tasks 테이블 확장
-- ============================================================
ALTER TABLE public.tasks
  ADD COLUMN parent_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  ADD COLUMN start_date DATE;

CREATE INDEX idx_tasks_parent ON public.tasks(parent_id);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);

-- ============================================================
-- 2. task_assignees (다수 담당자)
-- ============================================================
CREATE TABLE public.task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, user_id)
);

CREATE INDEX idx_task_assignees_task ON public.task_assignees(task_id);
CREATE INDEX idx_task_assignees_user ON public.task_assignees(user_id);

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view assignees"
  ON public.task_assignees FOR SELECT TO authenticated USING (true);

CREATE POLICY "Task creator or admin can add assignees"
  ON public.task_assignees FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Task creator or admin can remove assignees"
  ON public.task_assignees FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 3. task_checklist_items (체크리스트)
-- ============================================================
CREATE TABLE public.task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checklist_task ON public.task_checklist_items(task_id, position);

ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view checklist"
  ON public.task_checklist_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Task participants can add checklist items"
  ON public.task_checklist_items FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
      AND (t.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = auth.uid()))
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Task participants can update checklist items"
  ON public.task_checklist_items FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
      AND (t.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = auth.uid()))
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Task participants can delete checklist items"
  ON public.task_checklist_items FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
      AND (t.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = auth.uid()))
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 4. task_attachments (첨부파일)
-- ============================================================
CREATE TABLE public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_task ON public.task_attachments(task_id);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view attachments"
  ON public.task_attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can upload attachments"
  ON public.task_attachments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Uploader or admin can delete attachments"
  ON public.task_attachments FOR DELETE TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 5. task_activities (활동 타임라인 — task_comments 대체)
-- ============================================================
CREATE TABLE public.task_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('comment', 'status_change', 'assignee_change', 'priority_change', 'attachment', 'checklist', 'edit')),
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_task ON public.task_activities(task_id, created_at);

ALTER TABLE public.task_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view activities"
  ON public.task_activities FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create activities"
  ON public.task_activities FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Creator or admin can delete activities"
  ON public.task_activities FOR DELETE TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 6. 체크리스트 통계 RPC
-- ============================================================
CREATE OR REPLACE FUNCTION get_task_checklist_stats(p_task_ids UUID[])
RETURNS TABLE(task_id UUID, total BIGINT, completed BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT ci.task_id, COUNT(*), COUNT(*) FILTER (WHERE ci.is_completed)
  FROM public.task_checklist_items ci
  WHERE ci.task_id = ANY(p_task_ids)
  GROUP BY ci.task_id;
$$;

-- ============================================================
-- 7. 데이터 마이그레이션: assigned_to → task_assignees
-- ============================================================
INSERT INTO public.task_assignees (task_id, user_id)
SELECT id, assigned_to FROM public.tasks
WHERE assigned_to IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;

-- ============================================================
-- 8. 데이터 마이그레이션: task_comments → task_activities
-- ============================================================
INSERT INTO public.task_activities (task_id, user_id, type, content, created_at)
SELECT task_id, user_id, 'comment', content, created_at
FROM public.task_comments;

-- ============================================================
-- 9. 기존 RLS 정책 제거 (assigned_to 참조하는 정책들)
-- ============================================================
DROP POLICY IF EXISTS "Creator/assignee/admin can update" ON public.tasks;
DROP POLICY IF EXISTS "Creator and assignee can update" ON public.tasks;

-- 새 UPDATE 정책 (task_assignees 기반)
CREATE POLICY "Creator/assignee/admin can update" ON public.tasks FOR UPDATE TO authenticated USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = id AND ta.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================================
-- 10. 기존 테이블/컬럼 정리
-- ============================================================
DROP TABLE public.task_comments;
ALTER TABLE public.tasks DROP COLUMN assigned_to;
