-- 113_influencer_document_delete_by_staff.sql
-- 인플루언서 서류 삭제를 승인된 직원 전체에게 허용한다.
--
-- 배경: 111 은 보관함(vault)을 따라 삭제를 관리자만 가능하게 두었다.
--       그런데 직원이 4명이고 운영 담당자가 admin 이 아니라, 잘못 올린 서류를
--       올린 사람조차 지울 수 없어 실수를 되돌릴 방법이 없었다.
--
-- 유지: 신분증·통장 사본(sensitive)은 지울 때도 2차 비밀번호가 필요하다.
--       Storage 정책이 has_vault_unlock() 을 계속 요구한다.

-- ============================================================
-- 1) 서류 / 버전 / 정리 큐 — 승인된 사용자 삭제 허용
-- ============================================================
DROP POLICY IF EXISTS "Admins can delete influencer_documents" ON public.influencer_documents;

CREATE POLICY "Approved users can delete influencer_documents"
  ON public.influencer_documents FOR DELETE TO authenticated
  USING (public.is_approved_user());

DROP POLICY IF EXISTS "Admins can delete influencer_document_versions" ON public.influencer_document_versions;

CREATE POLICY "Approved users can delete influencer_document_versions"
  ON public.influencer_document_versions FOR DELETE TO authenticated
  USING (public.is_approved_user());

DROP POLICY IF EXISTS "Admins can delete influencer_document_cleanup_queue" ON public.influencer_document_cleanup_queue;

CREATE POLICY "Approved users can delete influencer_document_cleanup_queue"
  ON public.influencer_document_cleanup_queue FOR DELETE TO authenticated
  USING (public.is_approved_user());

-- ============================================================
-- 2) Storage 파일 삭제 — 승인된 사용자 허용하되 민감 폴더는 잠금 유지
--    경로 2번째 조각이 'sensitive' 면 2차 비밀번호를 푼 상태여야 한다.
--    (읽기·쓰기 정책과 같은 조건 — 111 참고)
-- ============================================================
DROP POLICY IF EXISTS "Admins can delete influencer documents" ON storage.objects;

CREATE POLICY "Approved users can delete influencer documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'influencer-documents'
    AND public.is_approved_user()
    AND (split_part(name, '/', 2) <> 'sensitive' OR public.has_vault_unlock())
  );
