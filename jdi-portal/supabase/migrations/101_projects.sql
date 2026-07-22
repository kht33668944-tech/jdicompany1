-- ============================================================
-- 101: 프로젝트 (타임라인·할일 공통 분류)
--  - projects 테이블 + RLS (보기/생성/수정 = 승인 사용자, 삭제 = admin)
--  - work_timeline_entries.project_id, tasks.project_id (ON DELETE SET NULL)
--  - 초기 프로젝트 3개 + 기존 글 제목 접두어 자동 분류(접두어 제거)
--  주의: 접두어 제거는 되돌릴 수 없다. 적용 전 백업 시점 확인.
-- ============================================================

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 50),
  CONSTRAINT projects_color_check CHECK (color ~ '^#[0-9a-fA-F]{6}$')
);

CREATE UNIQUE INDEX idx_projects_name_unique ON public.projects (lower(btrim(name)));

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view projects"
  ON public.projects FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Approved users can create projects"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());

CREATE POLICY "Approved users can update projects"
  ON public.projects FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());

CREATE POLICY "Admins can delete projects"
  ON public.projects FOR DELETE TO authenticated
  USING (
    public.is_approved_user()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- 연결 컬럼 (프로젝트 삭제 시 글/할일은 미분류로 복귀)
-- ============================================================

ALTER TABLE public.work_timeline_entries
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX idx_work_timeline_entries_project
  ON public.work_timeline_entries (project_id) WHERE project_id IS NOT NULL;

CREATE INDEX idx_tasks_project
  ON public.tasks (project_id) WHERE project_id IS NOT NULL;

-- ============================================================
-- 초기 프로젝트 + 기존 글 자동 분류
-- ============================================================

INSERT INTO public.projects (name, color)
VALUES
  ('코스피랩', '#6366f1'),
  ('TMA', '#16a34a'),
  ('JDI 포탈', '#f59e0b')
ON CONFLICT (lower(btrim(name))) DO NOTHING;

-- 제목이 "코스피랩 - ", "TMA - ", "JDI 포탈 - " 형태로 시작하는 글을
-- 해당 프로젝트로 묶고 접두어를 제거한다. 제거 후 제목이 비면 원제목 유지.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT p.id AS project_id, pat.pattern
    FROM (VALUES
      ('코스피랩', '^\s*코스피랩\s*[-–—:]\s*'),
      ('TMA',     '^\s*TMA\s*[-–—:]\s*'),
      ('JDI 포탈', '^\s*JDI\s*포탈\s*[-–—:]\s*')
    ) AS pat(name, pattern)
    JOIN public.projects p ON lower(btrim(p.name)) = lower(pat.name)
  LOOP
    UPDATE public.work_timeline_entries e
    SET project_id = rec.project_id,
        title = CASE
          WHEN char_length(btrim(regexp_replace(e.title, rec.pattern, '', 'i'))) BETWEEN 1 AND 120
            THEN btrim(regexp_replace(e.title, rec.pattern, '', 'i'))
          ELSE e.title
        END
    WHERE e.project_id IS NULL
      AND e.title ~* rec.pattern;

    UPDATE public.tasks t
    SET project_id = rec.project_id,
        title = CASE
          WHEN char_length(btrim(regexp_replace(t.title, rec.pattern, '', 'i'))) >= 1
            THEN btrim(regexp_replace(t.title, rec.pattern, '', 'i'))
          ELSE t.title
        END
    WHERE t.project_id IS NULL
      AND t.title ~* rec.pattern;
  END LOOP;
END $$;

-- 트리 오너먼트 관련 타임라인 글 → TMA (크리스마스 트리 브랜드, 제목은 유지)
UPDATE public.work_timeline_entries e
SET project_id = p.id
FROM public.projects p
WHERE lower(btrim(p.name)) = 'tma'
  AND e.project_id IS NULL
  AND (e.title ~* '오너먼트' OR e.title ~* '트리');
