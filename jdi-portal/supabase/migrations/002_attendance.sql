CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  total_minutes INTEGER GENERATED ALWAYS AS (
    CASE WHEN check_in IS NOT NULL AND check_out IS NOT NULL
    THEN EXTRACT(EPOCH FROM (check_out - check_in))::INTEGER / 60
    ELSE NULL END
  ) STORED,
  status TEXT NOT NULL DEFAULT '미출근' CHECK (status IN ('미출근', '근무중', '퇴근')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, work_date)
);
CREATE INDEX idx_attendance_user_date ON public.attendance_records(user_id, work_date DESC);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own" ON public.attendance_records FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all attendance" ON public.attendance_records FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Users can insert own" ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own" ON public.attendance_records FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can update any attendance" ON public.attendance_records FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
