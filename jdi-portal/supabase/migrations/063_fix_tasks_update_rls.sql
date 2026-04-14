-- 063: tasks UPDATE RLS 정책 수정
-- 버그: ta.task_id = id 에서 id가 task_assignees.id로 해석됨 (tasks.id여야 함)
-- 결과: 담당자(assignee)가 할일을 수정할 수 없었음

DROP POLICY IF EXISTS "Creator/assignee/admin can update" ON public.tasks;

CREATE POLICY "Creator/assignee/admin can update" ON public.tasks FOR UPDATE TO authenticated USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.task_assignees ta
    WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);
