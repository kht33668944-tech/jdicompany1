-- ============================================================
-- 084: 업무 타임라인 완료 시각 및 Storage 정리 내구성 강화
-- ============================================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

UPDATE public.tasks
SET completed_at = updated_at
WHERE status = '완료'
  AND completed_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_task_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = '완료' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.completed_at = now();
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status <> '완료' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_set_completed_at ON public.tasks;
CREATE TRIGGER tasks_set_completed_at
  BEFORE INSERT OR UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_task_completed_at();

CREATE TABLE public.work_timeline_storage_cleanup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 사용자 삭제 뒤에도 Storage 고아 파일을 관리자가 정리할 수 있도록 FK를 두지 않는다.
  owner_id uuid NOT NULL,
  path text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_timeline_cleanup_path_check CHECK (
    split_part(path, '/', 1) = owner_id::text
    AND split_part(path, '/', 2) <> ''
    AND split_part(path, '/', 3) <> ''
    AND split_part(path, '/', 4) = ''
  )
);

CREATE INDEX idx_work_timeline_cleanup_queue_created
  ON public.work_timeline_storage_cleanup_queue (created_at);

ALTER TABLE public.work_timeline_storage_cleanup_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can view work timeline cleanup queue"
  ON public.work_timeline_storage_cleanup_queue FOR SELECT TO authenticated
  USING (
    public.is_approved_user()
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );

CREATE POLICY "Owners and admins can create work timeline cleanup queue"
  ON public.work_timeline_storage_cleanup_queue FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user()
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );

CREATE POLICY "Owners and admins can update work timeline cleanup queue"
  ON public.work_timeline_storage_cleanup_queue FOR UPDATE TO authenticated
  USING (
    public.is_approved_user()
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  )
  WITH CHECK (
    public.is_approved_user()
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );

CREATE POLICY "Owners and admins can delete work timeline cleanup queue"
  ON public.work_timeline_storage_cleanup_queue FOR DELETE TO authenticated
  USING (
    public.is_approved_user()
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );
