-- 123_company_contracts.sql
-- 계약관리(범용 계약서) — 양식 무제한 + 계약서 문서(전자서명 이력 포함)
--
-- 배경
--  * TMA 인플루언서 전자서명(122)을 엔진으로 재사용해, 거래처·외주 등 회사의 모든
--    계약서를 포털에서 처리한다. TMA 테이블은 인플루언서 명단에 묶여 있어(계약 FK,
--    유형 2종 고정) 범용으로 쓸 수 없으므로 병렬 테이블을 새로 둔다.
--  * 상대방은 로그인 없이 서명 링크(/sign/c/{token})로 접근한다. 이 공개 흐름은
--    anon RLS 정책이 아니라 **서버의 service role 클라이언트**로만 처리하므로,
--    이 마이그레이션에는 anon 정책이 하나도 없다.
--
-- 설계 원칙 (122와 동일 골격, 다른 점만 표시)
--  1) company_contract_templates: 양식 무제한(122는 유형 2종 고정). 삭제는 is_deleted
--     소프트 삭제만 — DELETE 정책 없음.
--  2) company_contract_documents: 계약서 1부 = 1행. DELETE 정책 없음(서명 이력은
--     증거 — 취소는 status='canceled', 목록 숨김은 is_deleted).
--  3) 상대방 입력값(주소·계좌 등 개인정보)은 signer_fields_enc 에 AES-256-GCM 으로
--     통째 암호화 저장 — 평문 개인정보는 DB에 넣지 않는다(122의 settlements 원칙).
--  4) 파일은 새 비공개 버킷 company-contract-docs 에 저장. 직원 읽기(SELECT)만 정책으로
--     열고, 쓰기는 전부 서버 service role — INSERT 정책을 아예 두지 않아 119보다 좁다.
--
-- 롤백
--   DROP TRIGGER IF EXISTS company_contract_documents_set_updated_at ON public.company_contract_documents;
--   DROP TRIGGER IF EXISTS company_contract_templates_set_updated_at ON public.company_contract_templates;
--   DROP TABLE IF EXISTS public.company_contract_documents;
--   DROP TABLE IF EXISTS public.company_contract_templates;
--   DELETE FROM storage.buckets WHERE id = 'company-contract-docs';

-- ============================================================
-- 1) 계약서 양식 (무제한, 소프트 삭제)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.company_contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,                              -- 양식 이름 (예: 용역 계약서)
  content jsonb NOT NULL,                           -- ContentV2 (조항 + 필드 정의)
  is_deleted boolean NOT NULL DEFAULT false,        -- 소프트 삭제(목록 숨김)
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_contract_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view company contract templates" ON public.company_contract_templates;
CREATE POLICY "Approved users can view company contract templates"
  ON public.company_contract_templates FOR SELECT
  USING (public.is_approved_user());

DROP POLICY IF EXISTS "Approved users can create company contract templates" ON public.company_contract_templates;
CREATE POLICY "Approved users can create company contract templates"
  ON public.company_contract_templates FOR INSERT
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Approved users can update company contract templates" ON public.company_contract_templates;
CREATE POLICY "Approved users can update company contract templates"
  ON public.company_contract_templates FOR UPDATE
  USING (public.is_approved_user());

-- DELETE 정책 없음 — 삭제는 is_deleted 소프트 삭제만.

DROP TRIGGER IF EXISTS company_contract_templates_set_updated_at ON public.company_contract_templates;
CREATE TRIGGER company_contract_templates_set_updated_at
  BEFORE UPDATE ON public.company_contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2) 계약서 문서 (계약서 1부 = 1행, 서명 이력 포함)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.company_contract_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.company_contract_templates(id),  -- 빈 문서면 NULL, CASCADE 없음
  title text NOT NULL,                              -- 계약서 이름 (목록 표시)
  counterparty_name text NOT NULL,                  -- 을 표시명(담당자 기재 — 목록/검색용)
  counterparty_company text,                        -- 법인명(법인 계약일 때)
  counterparty_kind text NOT NULL DEFAULT 'individual'
    CHECK (counterparty_kind IN ('individual', 'corp')),

  -- 생성 시점의 본문 스냅샷(조항 + 필드 정의 + 직원 채움 값).
  -- 상대방 입력값은 여기 절대 저장하지 않는다(암호화 컬럼과 PDF에만 존재).
  content jsonb NOT NULL,

  -- draft(편집 가능) → sent(잠금·서명 대기) → signed / canceled
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'signed', 'canceled')),

  -- 서명 링크: /sign/c/{sign_token}. 발송 시 생성, 256bit 랜덤(base64url), 만료 7일.
  sign_token text UNIQUE,
  token_expires_at timestamptz,

  sent_at timestamptz,
  viewed_at timestamptz,                -- 상대방이 처음 연 시각
  signed_at timestamptz,
  signer_name text,                     -- 서명자 성명 — 계약서 표시용
  signature_path text,                  -- 손서명 PNG 또는 법인 도장 이미지 (비공개 버킷)
  signed_pdf_path text,                 -- 서명 완료 PDF (비공개 버킷)
  pdf_sha256 text,                      -- 완료 PDF 지문(위변조 검증용)
  signer_fields_enc text,               -- 상대방 입력값 JSON 통째 암호화(AES-256-GCM)
  audit jsonb,                          -- { ip, user_agent, content_sha256, signature_mode }

  is_deleted boolean NOT NULL DEFAULT false,        -- 목록 숨김(서명본은 앱에서 숨김 금지)
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_contract_documents_list
  ON public.company_contract_documents (status, created_at DESC);

ALTER TABLE public.company_contract_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view company contract documents" ON public.company_contract_documents;
CREATE POLICY "Approved users can view company contract documents"
  ON public.company_contract_documents FOR SELECT
  USING (public.is_approved_user());

DROP POLICY IF EXISTS "Approved users can create company contract documents" ON public.company_contract_documents;
CREATE POLICY "Approved users can create company contract documents"
  ON public.company_contract_documents FOR INSERT
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Approved users can update company contract documents" ON public.company_contract_documents;
CREATE POLICY "Approved users can update company contract documents"
  ON public.company_contract_documents FOR UPDATE
  USING (public.is_approved_user());

-- DELETE 정책 없음 — 서명 이력은 증거로 보존. 취소는 status='canceled'.
-- anon 정책 없음 — 공개 서명 흐름은 서버 service role 클라이언트만 사용.

DROP TRIGGER IF EXISTS company_contract_documents_set_updated_at ON public.company_contract_documents;
CREATE TRIGGER company_contract_documents_set_updated_at
  BEFORE UPDATE ON public.company_contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3) Storage — 비공개 버킷 (10MB)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('company-contract-docs', 'company-contract-docs', FALSE, 10485760)
ON CONFLICT (id) DO NOTHING;

-- 직원 읽기 전용. 쓰기(INSERT/UPDATE/DELETE) 정책은 의도적으로 없다 —
-- 서명 이미지·완료 PDF 는 전부 서버 service role 이 기록한다(RLS 우회).
DROP POLICY IF EXISTS "Approved users can read company contract docs" ON storage.objects;
CREATE POLICY "Approved users can read company contract docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'company-contract-docs' AND public.is_approved_user());
