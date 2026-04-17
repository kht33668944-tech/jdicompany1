-- ============================================================
-- 067_projects.sql
-- Project management v1: projects, project members, task linkage
-- ============================================================

CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'paused', 'completed')),
  start_date DATE,
  due_date DATE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_status ON public.projects(status);
CREATE INDEX idx_projects_owner ON public.projects(owner_id);
CREATE INDEX idx_projects_due_date ON public.projects(due_date);

CREATE TABLE public.project_members (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX idx_project_members_user ON public.project_members(user_id);

ALTER TABLE public.tasks
  ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX idx_tasks_project ON public.tasks(project_id);

CREATE OR REPLACE FUNCTION public.is_project_owner_or_admin(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = auth.uid()
      AND pr.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.touch_project_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_project_updated_at();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view projects"
  ON public.projects FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Approved users can create own projects"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND owner_id = auth.uid());

CREATE POLICY "Owner or admin can update projects"
  ON public.projects FOR UPDATE TO authenticated
  USING (public.is_approved_user() AND public.is_project_owner_or_admin(id))
  WITH CHECK (public.is_approved_user() AND public.is_project_owner_or_admin(id));

CREATE POLICY "Owner or admin can delete projects"
  ON public.projects FOR DELETE TO authenticated
  USING (public.is_approved_user() AND public.is_project_owner_or_admin(id));

CREATE POLICY "Approved users can view project members"
  ON public.project_members FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Owner or admin can add project members"
  ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user()
    AND public.is_project_owner_or_admin(project_id)
  );

CREATE POLICY "Owner or admin can update project members"
  ON public.project_members FOR UPDATE TO authenticated
  USING (
    public.is_approved_user()
    AND public.is_project_owner_or_admin(project_id)
  )
  WITH CHECK (
    public.is_approved_user()
    AND public.is_project_owner_or_admin(project_id)
  );

CREATE POLICY "Owner or admin can delete project members"
  ON public.project_members FOR DELETE TO authenticated
  USING (
    public.is_approved_user()
    AND public.is_project_owner_or_admin(project_id)
  );
