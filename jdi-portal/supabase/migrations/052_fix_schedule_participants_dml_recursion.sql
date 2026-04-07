-- ============================================
-- 050_fix_schedule_participants_dml_recursion.sql
-- 048 가 schedule_participants SELECT 정책의 schedules ↔ schedule_participants
-- 상호 재귀를 SECURITY DEFINER 헬퍼로 끊었지만, INSERT/DELETE 정책은 여전히
-- schedules 를 직접 EXISTS 로 참조하고 있어서 동일한 재귀가 발생.
-- 결과: 일정 생성 시 setParticipants 의 첫 DELETE 가 500 Internal Server Error.
-- 헬퍼 is_schedule_creator() 로 통일해 끊어준다.
-- ============================================

-- INSERT 정책 재작성
DROP POLICY IF EXISTS "Approved schedule creator or admin can manage participants"
  ON public.schedule_participants;

CREATE POLICY "Approved schedule creator or admin can manage participants"
  ON public.schedule_participants FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user() AND (
      public.is_schedule_creator(schedule_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- DELETE 정책 재작성
DROP POLICY IF EXISTS "Approved schedule creator or admin can delete participants"
  ON public.schedule_participants;

CREATE POLICY "Approved schedule creator or admin can delete participants"
  ON public.schedule_participants FOR DELETE TO authenticated
  USING (
    public.is_approved_user() AND (
      public.is_schedule_creator(schedule_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );
