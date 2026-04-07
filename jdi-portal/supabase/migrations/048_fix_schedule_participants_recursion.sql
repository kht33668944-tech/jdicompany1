-- ============================================
-- 048_fix_schedule_participants_recursion.sql
-- 047 의 schedule_participants SELECT 정책이 schedules 를 참조하면서
-- schedules SELECT 정책 (이미 schedule_participants 참조) 과 상호 재귀 발생.
-- SECURITY DEFINER 헬퍼로 RLS 우회 경로를 만들어 끊어준다.
-- ============================================

-- 헬퍼: 호출자가 해당 schedule 의 생성자인지 (RLS 우회)
CREATE OR REPLACE FUNCTION public.is_schedule_creator(p_schedule_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.schedules
     WHERE id = p_schedule_id AND created_by = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_schedule_creator(UUID) TO authenticated;

-- 헬퍼: 해당 schedule 이 회사 일정인지 (RLS 우회)
CREATE OR REPLACE FUNCTION public.is_company_schedule(p_schedule_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.schedules
     WHERE id = p_schedule_id AND visibility = 'company'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_company_schedule(UUID) TO authenticated;

-- schedule_participants SELECT 정책 재작성: schedules 직접 참조 제거
DROP POLICY IF EXISTS "Approved members can view participants" ON public.schedule_participants;
CREATE POLICY "Approved members can view participants"
  ON public.schedule_participants FOR SELECT TO authenticated
  USING (
    public.is_approved_user() AND (
      user_id = auth.uid()
      OR public.is_schedule_creator(schedule_id)
      OR public.is_company_schedule(schedule_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );
