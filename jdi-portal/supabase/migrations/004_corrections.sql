CREATE TABLE public.correction_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendance_record_id UUID REFERENCES public.attendance_records(id),
  target_date DATE NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('출근시간수정', '퇴근시간수정', '기록누락')),
  requested_check_in TIMESTAMPTZ,
  requested_check_out TIMESTAMPTZ,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '대기중' CHECK (status IN ('대기중', '승인', '반려')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own corrections" ON public.correction_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all corrections" ON public.correction_requests FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Users can insert own corrections" ON public.correction_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can update corrections" ON public.correction_requests FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
