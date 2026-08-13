-- 122_contract_esign.sql
-- TMA 계약서 자체 전자서명 — 양식(템플릿)과 계약서 문서(서명 이력 포함)
--
-- 배경
--  * 모두싸인은 비용 문제로 영구 제외(2026-08-12). 계약서 생성→전자서명→보관을
--    전부 포털 안에서 처리한다. 설계: docs/superpowers/specs/2026-08-12-contract-esign-design.md
--  * 인플루언서는 로그인 없이 서명 링크(/sign/{token})로 접근한다. 이 공개 흐름은
--    anon RLS 정책이 아니라 **서버의 service role 클라이언트**로만 처리하므로,
--    이 마이그레이션에는 anon 정책이 하나도 없다(익명 직접 접근은 전부 차단 유지).
--
-- 설계 원칙
--  1) influencer_contract_templates: 계약 유형별 양식 1행(paid/seeding). 기본 양식은
--     앱 코드(TS 상수)에 있고, 운영자가 편집하면 이 테이블에 저장된 내용이 우선한다.
--  2) influencer_contract_documents: 계약서 1부 = 1행. 취소 후 재발송 이력을 남기기
--     위해 한 계약에 여러 행을 허용한다. DELETE 정책 없음(119 계약 본체와 동일 원칙,
--     서명 이력은 증거라 지우지 않는다 — 취소는 status='canceled').
--  3) 서명 토큰(sign_token)은 유일 식별자이자 인가 수단(256bit 랜덤, 만료 7일).
--  4) 서명 완료 PDF·서명 이미지·신분증은 기존 비공개 버킷 influencer-contract-docs 에
--     저장한다(119 정책 재사용 — 직원 읽기는 approved, 공개 흐름 쓰기는 service role).
--
-- 롤백
--   DROP TRIGGER IF EXISTS influencer_contract_documents_set_updated_at ON public.influencer_contract_documents;
--   DROP TRIGGER IF EXISTS influencer_contract_templates_set_updated_at ON public.influencer_contract_templates;
--   DROP TABLE IF EXISTS public.influencer_contract_documents;
--   DROP TABLE IF EXISTS public.influencer_contract_templates;

-- ============================================================
-- 1) 계약서 양식 (계약 유형별 1행)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.influencer_contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE
    CHECK (template_key IN ('paid', 'seeding')),   -- 광고비 지급형 / 순수 협찬형
  content jsonb NOT NULL,                          -- 조항 본문(제목/전문/조항 목록 등)
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.influencer_contract_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view contract templates" ON public.influencer_contract_templates;
CREATE POLICY "Approved users can view contract templates"
  ON public.influencer_contract_templates FOR SELECT
  USING (public.is_approved_user());

DROP POLICY IF EXISTS "Approved users can create contract templates" ON public.influencer_contract_templates;
CREATE POLICY "Approved users can create contract templates"
  ON public.influencer_contract_templates FOR INSERT
  WITH CHECK (public.is_approved_user());

DROP POLICY IF EXISTS "Approved users can update contract templates" ON public.influencer_contract_templates;
CREATE POLICY "Approved users can update contract templates"
  ON public.influencer_contract_templates FOR UPDATE
  USING (public.is_approved_user());

-- DELETE 정책 없음 — 양식은 편집(UPDATE)만 가능. 실수 삭제로 기본 양식이 사라지는
-- 사고를 DB 차원에서 차단한다.

DROP TRIGGER IF EXISTS influencer_contract_templates_set_updated_at ON public.influencer_contract_templates;
CREATE TRIGGER influencer_contract_templates_set_updated_at
  BEFORE UPDATE ON public.influencer_contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2) 계약서 문서 (계약서 1부 = 1행, 서명 이력 포함)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.influencer_contract_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.influencer_contracts(id) ON DELETE CASCADE,
  template_key text NOT NULL
    CHECK (template_key IN ('paid', 'seeding')),

  -- 생성 시점의 본문 스냅샷(조항 + 조건표 값). draft 상태에서만 수정된다(앱 강제).
  content jsonb NOT NULL,

  -- draft(편집 가능) → sent(잠금·서명 대기) → signed / canceled
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'signed', 'canceled')),

  -- 서명 링크: /sign/{sign_token}. 발송 시 생성, 256bit 랜덤(base64url), 만료 7일.
  sign_token text UNIQUE,
  token_expires_at timestamptz,

  sent_at timestamptz,
  viewed_at timestamptz,                -- 인플루언서가 처음 연 시각
  signed_at timestamptz,
  signer_name text,                     -- 서명자 성명(실명) — 계약서 표시용
  signature_path text,                  -- 손서명 PNG (비공개 버킷)
  signed_pdf_path text,                 -- 서명 완료 PDF (비공개 버킷)
  pdf_sha256 text,                      -- 완료 PDF 지문(위변조 검증용)
  audit jsonb,                          -- { ip, user_agent } 등 증거 기록

  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_documents_contract
  ON public.influencer_contract_documents (contract_id, created_at DESC);

ALTER TABLE public.influencer_contract_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view contract documents" ON public.influencer_contract_documents;
CREATE POLICY "Approved users can view contract documents"
  ON public.influencer_contract_documents FOR SELECT
  USING (public.is_approved_user());

DROP POLICY IF EXISTS "Approved users can create contract documents" ON public.influencer_contract_documents;
CREATE POLICY "Approved users can create contract documents"
  ON public.influencer_contract_documents FOR INSERT
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Approved users can update contract documents" ON public.influencer_contract_documents;
CREATE POLICY "Approved users can update contract documents"
  ON public.influencer_contract_documents FOR UPDATE
  USING (public.is_approved_user());

-- DELETE 정책 없음 — 서명 이력은 증거로 보존. 취소는 status='canceled'.
-- anon 정책 없음 — 공개 서명 흐름은 서버 service role 클라이언트만 사용.

DROP TRIGGER IF EXISTS influencer_contract_documents_set_updated_at ON public.influencer_contract_documents;
CREATE TRIGGER influencer_contract_documents_set_updated_at
  BEFORE UPDATE ON public.influencer_contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
