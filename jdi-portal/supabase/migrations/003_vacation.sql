CREATE TABLE public.vacation_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  total_days NUMERIC(4,1) NOT NULL DEFAULT 15,
  used_days NUMERIC(4,1) NOT NULL DEFAULT 0,
  remaining_days NUMERIC(4,1) GENERATED ALWAYS AS (total_days - used_days) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, year)
);

ALTER TABLE public.vacation_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own balance" ON public.vacation_balances FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all balances" ON public.vacation_balances FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can manage balances" ON public.vacation_balances FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE public.vacation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vacation_type TEXT NOT NULL CHECK (vacation_type IN ('연차', '반차-오전', '반차-오후', '병가', '특별휴가')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count NUMERIC(4,1) NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT '대기중' CHECK (status IN ('대기중', '승인', '반려')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vacation_user ON public.vacation_requests(user_id, start_date DESC);
CREATE INDEX idx_vacation_status ON public.vacation_requests(status);

ALTER TABLE public.vacation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own requests" ON public.vacation_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all requests" ON public.vacation_requests FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Users can insert own requests" ON public.vacation_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can cancel pending" ON public.vacation_requests FOR UPDATE TO authenticated USING (user_id = auth.uid() AND status = '대기중');
CREATE POLICY "Admins can update any request" ON public.vacation_requests FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
