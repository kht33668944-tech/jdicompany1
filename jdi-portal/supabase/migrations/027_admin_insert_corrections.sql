-- 027_admin_insert_corrections.sql
-- 관리자가 다른 직원의 정정 요청을 대신 등록할 수 있도록 허용

CREATE POLICY "Admins can insert corrections for any user"
  ON public.correction_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
