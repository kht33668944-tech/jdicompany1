-- 스케줄 관리 테이블
CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'INTERNAL'
    CHECK (category IN ('INTERNAL', 'REPORT', 'EXTERNAL', 'VACATION', 'MAINTENANCE')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
  location TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedules_start ON public.schedules(start_time);
CREATE INDEX idx_schedules_end ON public.schedules(end_time);
CREATE INDEX idx_schedules_created_by ON public.schedules(created_by);
CREATE INDEX idx_schedules_category ON public.schedules(category);

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자 조회 가능
CREATE POLICY "Authenticated can view schedules"
  ON public.schedules FOR SELECT TO authenticated
  USING (true);

-- 작성자만 생성 가능
CREATE POLICY "Authenticated can create schedules"
  ON public.schedules FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- 작성자 또는 admin 수정 가능
CREATE POLICY "Creator or admin can update schedules"
  ON public.schedules FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 작성자 또는 admin 삭제 가능
CREATE POLICY "Creator or admin can delete schedules"
  ON public.schedules FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
