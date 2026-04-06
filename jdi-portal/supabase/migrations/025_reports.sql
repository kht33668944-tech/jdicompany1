-- ============================================================
-- 025: 버그/불편사항 신고 시스템
-- ============================================================

-- reports 테이블
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('bug', 'inconvenience', 'improvement')),
  page text NOT NULL CHECK (page IN ('dashboard', 'attendance', 'tasks', 'schedule', 'settings')),
  title text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_progress', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- report_attachments 테이블
CREATE TABLE public.report_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_reports_user_id ON public.reports (user_id);
CREATE INDEX idx_reports_status ON public.reports (status);
CREATE INDEX idx_reports_created_at ON public.reports (created_at DESC);
CREATE INDEX idx_report_attachments_report_id ON public.report_attachments (report_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER reports_set_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- RLS — reports
-- ============================================================
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 전체 조회
CREATE POLICY "Authenticated can view reports"
  ON public.reports FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 본인만 INSERT (user_id = 본인)
CREATE POLICY "Users can insert own reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 작성자(submitted 상태) 또는 관리자가 UPDATE
CREATE POLICY "Authors and admins can update reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'submitted')
    OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 작성자만 DELETE (submitted 상태일 때)
CREATE POLICY "Authors can delete own submitted reports"
  ON public.reports FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'submitted');

-- ============================================================
-- RLS — report_attachments
-- ============================================================
ALTER TABLE public.report_attachments ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 전체 조회
CREATE POLICY "Authenticated can view report attachments"
  ON public.report_attachments FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 해당 신고의 작성자만 첨부파일 INSERT
CREATE POLICY "Report authors can insert attachments"
  ON public.report_attachments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE id = report_id AND user_id = auth.uid()
    )
  );

-- 해당 신고의 작성자만 첨부파일 DELETE
CREATE POLICY "Report authors can delete attachments"
  ON public.report_attachments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE id = report_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- Storage — reports 버킷
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('reports', 'reports', false)
  ON CONFLICT DO NOTHING;

CREATE POLICY "Authenticated can upload report files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reports');

CREATE POLICY "Authenticated can view report files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reports');

CREATE POLICY "Authenticated can delete report files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'reports');
