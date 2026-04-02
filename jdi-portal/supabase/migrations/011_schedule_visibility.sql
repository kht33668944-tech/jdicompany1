-- 개인/회사 일정 구분을 위한 visibility 컬럼 추가
ALTER TABLE public.schedules
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'company'
  CHECK (visibility IN ('company', 'private'));

-- 기존 SELECT 정책 교체: company는 전체, private는 본인만
DROP POLICY IF EXISTS "Authenticated can view schedules" ON public.schedules;

CREATE POLICY "View company or own private schedules"
  ON public.schedules FOR SELECT TO authenticated
  USING (
    visibility = 'company'
    OR created_by = auth.uid()
  );
