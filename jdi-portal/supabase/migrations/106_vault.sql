-- 106_vault.sql
-- 보관함 도메인: 서류 보관함(법인별 폴더 + 파일 버전 이력) + 계정 보관함(공용 계정, 비번 암호화 + 2차 비밀번호 게이트)
--
-- 보안 요약
--  * 서류/계정 데이터 테이블은 모두 RLS + public.is_approved_user() (승인 직원만)
--  * 삭제 권한: 법인/서류/서류버전 = 관리자만, 계정/계정이력 = 승인 직원 누구나(앱단 2차 비밀번호 게이트로 추가 보호)
--  * 계정 비밀번호/2차 비밀번호는 앱 서버(Node AES-256-GCM)에서 암호화한 문자열만 저장(*_enc). 이 마이그레이션은 평문을 다루지 않음.
--  * 2차 비밀번호(게이트)는 pgcrypto crypt()/gen_salt('bf') 해시로만 저장. 해시는 클라이언트에 노출하지 않고 SECURITY DEFINER RPC로만 검증.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 관리자 판별 인라인 헬퍼 조건: EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')

-- ============================================================
-- 1) 법인(폴더)
-- ============================================================
CREATE TABLE public.vault_corporations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vault_corporations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view corporations"
  ON public.vault_corporations FOR SELECT TO authenticated
  USING (public.is_approved_user());
CREATE POLICY "Approved users can create corporations"
  ON public.vault_corporations FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());
CREATE POLICY "Approved users can update corporations"
  ON public.vault_corporations FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());
CREATE POLICY "Admins can delete corporations"
  ON public.vault_corporations FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 2) 서류
-- ============================================================
CREATE TABLE public.vault_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corporation_id uuid NOT NULL REFERENCES public.vault_corporations(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vault_documents_corp_idx ON public.vault_documents (corporation_id);

ALTER TABLE public.vault_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view documents"
  ON public.vault_documents FOR SELECT TO authenticated
  USING (public.is_approved_user());
CREATE POLICY "Approved users can create documents"
  ON public.vault_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());
CREATE POLICY "Approved users can update documents"
  ON public.vault_documents FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());
CREATE POLICY "Admins can delete documents"
  ON public.vault_documents FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 3) 서류 버전(최신화 이력)
-- ============================================================
CREATE TABLE public.vault_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.vault_documents(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text,
  file_size bigint,
  mime_type text,
  version_no int NOT NULL,
  is_current boolean NOT NULL DEFAULT TRUE,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vault_document_versions_doc_idx ON public.vault_document_versions (document_id);

ALTER TABLE public.vault_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view document versions"
  ON public.vault_document_versions FOR SELECT TO authenticated
  USING (public.is_approved_user());
CREATE POLICY "Approved users can create document versions"
  ON public.vault_document_versions FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND uploaded_by = auth.uid());
CREATE POLICY "Approved users can update document versions"
  ON public.vault_document_versions FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());
CREATE POLICY "Admins can delete document versions"
  ON public.vault_document_versions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 4) 공용 계정 (비번/2차비번은 암호문만 저장)
-- ============================================================
CREATE TABLE public.vault_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  username text,           -- 아이디: 검색용 평문
  url text,
  note text,
  tags text[] NOT NULL DEFAULT '{}',
  password_enc text,       -- 앱에서 AES-256-GCM 암호화한 문자열
  secondary_enc text,      -- 2차 비밀번호(있을 때만)
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vault_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view accounts"
  ON public.vault_accounts FOR SELECT TO authenticated
  USING (public.is_approved_user());
CREATE POLICY "Approved users can create accounts"
  ON public.vault_accounts FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());
CREATE POLICY "Approved users can update accounts"
  ON public.vault_accounts FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());
CREATE POLICY "Approved users can delete accounts"
  ON public.vault_accounts FOR DELETE TO authenticated
  USING (public.is_approved_user());

-- ============================================================
-- 5) 계정 비밀번호 변경 이력 (옛 암호문 보관)
-- ============================================================
CREATE TABLE public.vault_account_secret_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.vault_accounts(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('password', 'secondary')),
  old_value_enc text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vault_secret_history_account_idx ON public.vault_account_secret_history (account_id);

ALTER TABLE public.vault_account_secret_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view secret history"
  ON public.vault_account_secret_history FOR SELECT TO authenticated
  USING (public.is_approved_user());
CREATE POLICY "Approved users can create secret history"
  ON public.vault_account_secret_history FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND changed_by = auth.uid());

-- ============================================================
-- 6) 보관함 설정(2차 비밀번호 게이트) — 단일 행, 해시만 저장
-- ============================================================
CREATE TABLE public.vault_settings (
  id boolean PRIMARY KEY DEFAULT TRUE CHECK (id),
  gate_password_hash text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.vault_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.vault_settings ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = 클라이언트 직접 접근 전면 차단(해시 노출 방지). 접근은 아래 SECURITY DEFINER RPC로만.

-- 게이트가 설정돼 있는지만 알려줌(해시 미노출). 잠금 화면 안내용.
CREATE OR REPLACE FUNCTION public.vault_gate_configured()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_approved_user()
     AND EXISTS (SELECT 1 FROM public.vault_settings WHERE id = TRUE AND gate_password_hash IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.vault_gate_configured() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vault_gate_configured() TO authenticated;

-- 2차 비밀번호 검증(승인 직원만). 일치 시 TRUE.
CREATE OR REPLACE FUNCTION public.verify_vault_gate(p_password text)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  IF NOT public.is_approved_user() THEN
    RETURN FALSE;
  END IF;
  SELECT gate_password_hash INTO v_hash FROM public.vault_settings WHERE id = TRUE;
  IF v_hash IS NULL OR p_password IS NULL OR length(p_password) = 0 THEN
    RETURN FALSE;
  END IF;
  RETURN v_hash = crypt(p_password, v_hash);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_vault_gate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_vault_gate(text) TO authenticated;

-- 2차 비밀번호 설정/변경(관리자만).
CREATE OR REPLACE FUNCTION public.set_vault_gate(p_password text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '관리자만 2차 비밀번호를 설정할 수 있습니다.';
  END IF;
  IF p_password IS NULL OR length(p_password) < 4 THEN
    RAISE EXCEPTION '2차 비밀번호는 4자 이상이어야 합니다.';
  END IF;
  INSERT INTO public.vault_settings (id, gate_password_hash, updated_by, updated_at)
  VALUES (TRUE, crypt(p_password, gen_salt('bf')), auth.uid(), now())
  ON CONFLICT (id) DO UPDATE
    SET gate_password_hash = crypt(p_password, gen_salt('bf')),
        updated_by = auth.uid(),
        updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_vault_gate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_vault_gate(text) TO authenticated;

-- ============================================================
-- 7) Storage: 비공개 서류 버킷 + 정책
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('vault-documents', 'vault-documents', FALSE, 10485760)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Approved users can read vault documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vault-documents' AND public.is_approved_user());
CREATE POLICY "Approved users can upload vault documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vault-documents' AND public.is_approved_user());
CREATE POLICY "Admins can delete vault documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'vault-documents'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
