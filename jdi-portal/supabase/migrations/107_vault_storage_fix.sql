-- 107_vault_storage_fix.sql
-- 보관함 서류 업로드가 "new row violates row-level security policy" 로 실패하는 문제 수정.
-- 106의 vault-documents storage 정책을 검증된 DROP IF EXISTS + CREATE 패턴(030/047/090)으로 재적용해
-- 정책이 확실히 존재하도록 보장한다. (멱등 — 이미 있으면 재생성만 한다.)

-- 버킷 보장(없으면 생성)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('vault-documents', 'vault-documents', FALSE, 10485760)
ON CONFLICT (id) DO NOTHING;

-- 승인 직원: 서류 조회(서명 URL 생성 포함)
DROP POLICY IF EXISTS "Approved users can read vault documents" ON storage.objects;
CREATE POLICY "Approved users can read vault documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vault-documents' AND public.is_approved_user());

-- 승인 직원: 서류 업로드
DROP POLICY IF EXISTS "Approved users can upload vault documents" ON storage.objects;
CREATE POLICY "Approved users can upload vault documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vault-documents' AND public.is_approved_user());

-- 관리자: 서류 파일 삭제
DROP POLICY IF EXISTS "Admins can delete vault documents" ON storage.objects;
CREATE POLICY "Admins can delete vault documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'vault-documents'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
