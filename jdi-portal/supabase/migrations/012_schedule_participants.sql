-- 일정 참여자 테이블
CREATE TABLE public.schedule_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(schedule_id, user_id)
);

CREATE INDEX idx_schedule_participants_schedule ON public.schedule_participants(schedule_id);
CREATE INDEX idx_schedule_participants_user ON public.schedule_participants(user_id);

ALTER TABLE public.schedule_participants ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자 조회 가능
CREATE POLICY "Authenticated can view participants"
  ON public.schedule_participants FOR SELECT TO authenticated
  USING (true);

-- 일정 작성자 또는 admin만 참여자 추가/삭제 가능
CREATE POLICY "Schedule creator or admin can manage participants"
  ON public.schedule_participants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.schedules
      WHERE id = schedule_id AND (created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    )
  );

CREATE POLICY "Schedule creator or admin can delete participants"
  ON public.schedule_participants FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.schedules
      WHERE id = schedule_id AND (created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    )
  );

-- 스케줄 SELECT 정책 업데이트: 참여자도 볼 수 있도록
DROP POLICY IF EXISTS "View company or own private schedules" ON public.schedules;

CREATE POLICY "View company or own or participant schedules"
  ON public.schedules FOR SELECT TO authenticated
  USING (
    visibility = 'company'
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.schedule_participants
      WHERE schedule_id = id AND user_id = auth.uid()
    )
  );
