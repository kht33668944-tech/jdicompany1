-- ============================================================
-- 068_remove_projects.sql
-- Roll back project management v1
-- ============================================================

DROP TRIGGER IF EXISTS trg_projects_updated_at ON public.projects;

ALTER TABLE IF EXISTS public.tasks
  DROP COLUMN IF EXISTS project_id;

DROP TABLE IF EXISTS public.project_members;
DROP TABLE IF EXISTS public.projects;

DROP FUNCTION IF EXISTS public.touch_project_updated_at();
DROP FUNCTION IF EXISTS public.is_project_owner_or_admin(UUID);
