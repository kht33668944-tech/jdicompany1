-- 030_storage_policies_restrict.sql
-- 보안 강화: 스토리지 및 첨부파일 접근 정책 강화

-- ============================================================
-- 1. task-attachments 스토리지: 승인된 사용자만 + 본인 업로드만 삭제
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can view task attachments" ON storage.objects;
CREATE POLICY "Approved users can view task attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND public.is_approved_user()
  );

DROP POLICY IF EXISTS "Authenticated can upload task attachments" ON storage.objects;
CREATE POLICY "Approved users can upload task attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-attachments'
    AND public.is_approved_user()
  );

DROP POLICY IF EXISTS "Authenticated can delete task attachments" ON storage.objects;
CREATE POLICY "Approved users can delete own task attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND public.is_approved_user()
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ============================================================
-- 2. reports 스토리지: 승인된 사용자만 + 본인 업로드만 삭제
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can view report files" ON storage.objects;
CREATE POLICY "Approved users can view report files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'reports'
    AND public.is_approved_user()
  );

DROP POLICY IF EXISTS "Authenticated can upload report files" ON storage.objects;
CREATE POLICY "Approved users can upload report files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'reports'
    AND public.is_approved_user()
  );

DROP POLICY IF EXISTS "Authenticated can delete report files" ON storage.objects;
CREATE POLICY "Approved users can delete own report files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'reports'
    AND public.is_approved_user()
    AND (
      (storage.foldername(name))[1] = auth.uid()::TEXT
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ============================================================
-- 3. report_attachments 메타데이터: 승인된 사용자만 조회
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can view report attachments" ON public.report_attachments;
CREATE POLICY "Approved users can view report attachments"
  ON public.report_attachments FOR SELECT TO authenticated
  USING (public.is_approved_user());
