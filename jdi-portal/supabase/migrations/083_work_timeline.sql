-- ============================================================
-- 083: 업무 타임라인
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- 완료된 주요 업무를 최신순으로 공유하는 타임라인 항목
CREATE TABLE public.work_timeline_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_timeline_entries_title_check
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT work_timeline_entries_description_check
    CHECK (description IS NULL OR char_length(description) <= 5000)
);

-- 원본과 썸네일은 모두 private storage 경로만 저장한다.
CREATE TABLE public.work_timeline_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.work_timeline_entries(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  thumbnail_path text,
  mime_type text NOT NULL,
  file_size integer NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_timeline_attachments_file_name_check
    CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 255),
  CONSTRAINT work_timeline_attachments_file_path_check
    CHECK (char_length(btrim(file_path)) > 0),
  CONSTRAINT work_timeline_attachments_thumbnail_path_check
    CHECK (thumbnail_path IS NULL OR char_length(btrim(thumbnail_path)) > 0),
  CONSTRAINT work_timeline_attachments_mime_type_check
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  CONSTRAINT work_timeline_attachments_file_size_check
    CHECK (file_size BETWEEN 1 AND 10485760),
  CONSTRAINT work_timeline_attachments_position_check
    CHECK (position BETWEEN 0 AND 4)
);

CREATE INDEX idx_work_timeline_entries_completed
  ON public.work_timeline_entries (completed_at DESC, id DESC);

CREATE INDEX idx_work_timeline_entries_user_completed
  ON public.work_timeline_entries (user_id, completed_at DESC);

CREATE UNIQUE INDEX idx_work_timeline_entries_task_user_unique
  ON public.work_timeline_entries (task_id, user_id)
  WHERE task_id IS NOT NULL;

CREATE INDEX idx_work_timeline_entries_title_trgm
  ON public.work_timeline_entries
  USING gin (title extensions.gin_trgm_ops);

CREATE INDEX idx_work_timeline_entries_description_trgm
  ON public.work_timeline_entries
  USING gin (description extensions.gin_trgm_ops);

CREATE UNIQUE INDEX idx_work_timeline_attachments_entry_position_unique
  ON public.work_timeline_attachments (entry_id, position);

CREATE UNIQUE INDEX idx_work_timeline_attachments_file_path_unique
  ON public.work_timeline_attachments (file_path);

CREATE UNIQUE INDEX idx_work_timeline_attachments_thumbnail_path_unique
  ON public.work_timeline_attachments (thumbnail_path)
  WHERE thumbnail_path IS NOT NULL;

CREATE FUNCTION public.enforce_work_timeline_entry_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'work timeline entry owner cannot be changed'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.task_id IS DISTINCT FROM OLD.task_id THEN
    -- Preserve ON DELETE SET NULL when the referenced task is removed.
    IF NEW.task_id IS NULL
      AND OLD.task_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.tasks task WHERE task.id = OLD.task_id
      )
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'work timeline entry task cannot be changed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER work_timeline_entries_enforce_identity
  BEFORE UPDATE ON public.work_timeline_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_work_timeline_entry_identity();

CREATE TRIGGER work_timeline_entries_set_updated_at
  BEFORE UPDATE ON public.work_timeline_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- RLS: 업무 타임라인 항목
-- ============================================================

ALTER TABLE public.work_timeline_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view work timeline entries"
  ON public.work_timeline_entries FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Approved users can create own work timeline entries"
  ON public.work_timeline_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user()
    AND user_id = auth.uid()
    AND (
      task_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.tasks task
        WHERE task.id = work_timeline_entries.task_id
          AND task.status = '완료'
          AND (
            task.created_by = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.task_assignees assignee
              WHERE assignee.task_id = task.id
                AND assignee.user_id = auth.uid()
            )
          )
      )
    )
  );

CREATE POLICY "Owners can update work timeline entries"
  ON public.work_timeline_entries FOR UPDATE TO authenticated
  USING (
    public.is_approved_user()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    public.is_approved_user()
    AND user_id = auth.uid()
  );

CREATE POLICY "Owners and admins can delete work timeline entries"
  ON public.work_timeline_entries FOR DELETE TO authenticated
  USING (
    public.is_approved_user()
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );

-- ============================================================
-- RLS: 첨부 메타데이터
-- ============================================================

ALTER TABLE public.work_timeline_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view work timeline attachments"
  ON public.work_timeline_attachments FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Owners can create work timeline attachments"
  ON public.work_timeline_attachments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user()
    AND EXISTS (
      SELECT 1
      FROM public.work_timeline_entries entry
      WHERE entry.id = entry_id
        AND entry.user_id = auth.uid()
        AND split_part(file_path, '/', 1) = entry.user_id::text
        AND split_part(file_path, '/', 2) = entry.id::text
        AND split_part(file_path, '/', 3) <> ''
        AND split_part(file_path, '/', 4) = ''
        AND (
          thumbnail_path IS NULL
          OR (
            split_part(thumbnail_path, '/', 1) = entry.user_id::text
            AND split_part(thumbnail_path, '/', 2) = entry.id::text
            AND split_part(thumbnail_path, '/', 3) <> ''
            AND split_part(thumbnail_path, '/', 4) = ''
          )
        )
    )
  );

CREATE POLICY "Owners and admins can delete work timeline attachments"
  ON public.work_timeline_attachments FOR DELETE TO authenticated
  USING (
    public.is_approved_user()
    AND EXISTS (
      SELECT 1
      FROM public.work_timeline_entries entry
      WHERE entry.id = entry_id
        AND (
          entry.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
          )
        )
    )
  );

-- ============================================================
-- Storage: private work-timeline bucket
-- 경로 규칙: "{userId}/{entryId}/{uuid-or-thumbnail-filename}"
-- ============================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'work-timeline',
  'work-timeline',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Approved users can view work timeline files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'work-timeline'
    AND public.is_approved_user()
  );

CREATE POLICY "Approved users can upload own work timeline files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'work-timeline'
    AND public.is_approved_user()
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.work_timeline_entries entry
      WHERE entry.id::text = (storage.foldername(name))[2]
        AND entry.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and admins can delete work timeline files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'work-timeline'
    AND public.is_approved_user()
    AND array_length(storage.foldername(name), 1) = 2
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );
