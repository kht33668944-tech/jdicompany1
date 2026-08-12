-- 119_influencer_contracts.sql
-- 2026 TMA 크리스마스 시즌 인플루언서 계약/협업 관리
--
-- 배경
--  * 크리스마스 시즌 인플루언서 100명 협업의 계약 상태·조건·일정을 한 화면에서 관리한다.
--  * 모두싸인 자동 연동은 아직 하지 않는다. 문서 링크와 상태를 수동으로 기록한다(추후 TODO).
--  * 정산에 필요한 개인정보(휴대폰·주소·계좌·신분증)는 별도 테이블에 "암호문만" 저장하고,
--    열람은 보관함(106)과 같은 2차 비밀번호 게이트를 지나는 서버 액션으로만 한다.
--
-- 설계 원칙
--  1) influencer_contracts 는 시즌 협업 1건 = 1행. 삭제는 is_deleted 소프트 삭제만 쓴다
--     (DELETE 정책을 만들지 않아 실수/우회 삭제를 DB 차원에서 차단 — 114 후보 테이블 전례).
--  2) influencer_contract_settlements 는 개인정보를 앱 서버(AES-256-GCM, ACCOUNT_VAULT_KEY)에서
--     암호화한 문자열(*_enc)만 저장한다. 이 마이그레이션은 평문을 다루지 않는다(106과 동일).
--     2차 비밀번호 검증은 기존 public.verify_vault_gate(106) 를 그대로 재사용하므로 새 RPC가 없다.
--  3) 게시 유지 종료일(실제 게시일 + 6개월)은 파생값이라 저장하지 않고 앱에서 계산한다.
--  4) 기존 111 계열 테이블(influencer_contacts 등)과는 독립 — 이 기능은 시딩 리스트에 없는
--     인원도 계약만 먼저 등록할 수 있어야 하므로 influencers FK 를 두지 않는다.
--
-- 설계서: docs/superpowers/specs/2026-08-12-influencer-contracts-design.md
--
-- 롤백
--   DROP TRIGGER IF EXISTS influencer_contract_settlements_set_updated_at ON public.influencer_contract_settlements;
--   DROP TRIGGER IF EXISTS influencer_contracts_set_updated_at ON public.influencer_contracts;
--   DROP TABLE IF EXISTS public.influencer_contract_settlements;
--   DROP TABLE IF EXISTS public.influencer_contracts;
--   DELETE FROM storage.buckets WHERE id = 'influencer-contract-docs';
--   DROP POLICY IF EXISTS "Approved users can read contract docs" ON storage.objects;
--   DROP POLICY IF EXISTS "Approved users can upload contract docs" ON storage.objects;
--   DROP POLICY IF EXISTS "Admins can delete contract docs" ON storage.objects;

-- ============================================================
-- 1) 계약 본체
-- ============================================================
CREATE TABLE IF NOT EXISTS public.influencer_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  -- 시즌 구분. 지금은 2026 TMA 하나지만 내년 재사용을 위해 컬럼으로 둔다(UI 미노출).
  season text NOT NULL DEFAULT '2026-tma',

  -- 기본 정보
  name text NOT NULL,                          -- 이름/채널명
  instagram_handle text NOT NULL DEFAULT '',   -- @ 제외 저장
  collab_type text NOT NULL DEFAULT 'seeding'
    CHECK (collab_type IN ('paid', 'seeding')),        -- 광고비형 / 순수협찬형

  -- 제품·금액 (금액은 원 단위 정수)
  product text NOT NULL DEFAULT 'tree_150'
    CHECK (product IN ('tree_150', 'tree_180')),       -- 150cm / 180cm 트리
  product_detail text,                         -- 제품명·구성
  retail_price bigint,                         -- 소비자가
  agreed_value bigint,                         -- 약정가액
  ad_fee_total bigint,                         -- 광고비 총액(광고비형)
  ad_fee_vat_included boolean NOT NULL DEFAULT TRUE,   -- JDI 기본값 "부가세 포함"
  settlement_type text
    CHECK (settlement_type IN ('business', 'individual')),  -- 사업자 / 개인
  business_reg_no text,                        -- 사업자등록번호(선택)

  -- 2차 활용
  secondary_usage text NOT NULL DEFAULT 'not_allowed'
    CHECK (secondary_usage IN ('free', 'paid', 'not_allowed')),
  secondary_usage_fee bigint,
  secondary_usage_start date,
  secondary_usage_end date,
  allow_jdi_sns boolean NOT NULL DEFAULT FALSE,        -- JDI 자사 SNS 재게시
  allow_meta_ads boolean NOT NULL DEFAULT FALSE,       -- Instagram/Meta 유료 광고
  allow_edit boolean NOT NULL DEFAULT FALSE,           -- 발췌·컷편집·자막·로고·음악·타 영상 결합
  partnership_ad_access boolean NOT NULL DEFAULT FALSE, -- 파트너십 광고 권한 협조

  -- 촬영 원본
  raw_footage text NOT NULL DEFAULT 'not_provided'
    CHECK (raw_footage IN ('free', 'paid', 'not_provided')),
  raw_footage_fee bigint,
  raw_footage_scope text,
  raw_footage_due date,                        -- 원본 전달일

  -- 일정 (게시 유지 종료일은 저장하지 않음 — 앱에서 실제 게시일 + 6개월로 계산)
  product_ship_date date,
  draft_due_date date,
  post_planned_date date,
  post_actual_date date,

  -- 상태·기타
  required_files_status text NOT NULL DEFAULT 'none'
    CHECK (required_files_status IN ('none', 'partial', 'complete')),
  contract_status text NOT NULL DEFAULT 'candidate'
    CHECK (contract_status IN (
      'candidate', 'dm_sent', 'negotiating', 'contract_sent', 'signed',
      'product_shipped', 'draft_received', 'posted', 'settled', 'canceled')),
  modusign_url text,                           -- 모두싸인 문서 링크(수동 관리)
  memo text,

  is_deleted boolean NOT NULL DEFAULT FALSE,   -- 소프트 삭제
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.influencer_contracts ENABLE ROW LEVEL SECURITY;

-- 필터 축(상태/게시월)에 맞춘 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_influencer_contracts_status
  ON public.influencer_contracts (contract_status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_influencer_contracts_post_planned
  ON public.influencer_contracts (post_planned_date) WHERE is_deleted = FALSE;

DROP POLICY IF EXISTS "Approved users can view influencer_contracts" ON public.influencer_contracts;
CREATE POLICY "Approved users can view influencer_contracts"
  ON public.influencer_contracts FOR SELECT TO authenticated
  USING (public.is_approved_user());
DROP POLICY IF EXISTS "Approved users can create influencer_contracts" ON public.influencer_contracts;
CREATE POLICY "Approved users can create influencer_contracts"
  ON public.influencer_contracts FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());
DROP POLICY IF EXISTS "Approved users can update influencer_contracts" ON public.influencer_contracts;
CREATE POLICY "Approved users can update influencer_contracts"
  ON public.influencer_contracts FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());
-- DELETE 정책 없음(의도) — 삭제는 is_deleted = TRUE 소프트 삭제만 허용.

DROP TRIGGER IF EXISTS influencer_contracts_set_updated_at ON public.influencer_contracts;
CREATE TRIGGER influencer_contracts_set_updated_at
  BEFORE UPDATE ON public.influencer_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2) 정산 정보 (계약 1건당 1행, 암호문만 저장)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.influencer_contract_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL UNIQUE
    REFERENCES public.influencer_contracts(id) ON DELETE CASCADE,

  -- 아래 *_enc 는 앱 서버가 AES-256-GCM(ACCOUNT_VAULT_KEY)으로 암호화한 문자열.
  -- 평문은 DB에 저장되지 않으며, 복호화는 2차 비밀번호 게이트를 지난 서버 액션에서만 한다.
  phone_enc text NOT NULL DEFAULT '',          -- 휴대폰 번호
  address_enc text NOT NULL DEFAULT '',        -- 제품 수령 주소
  bank_name_enc text NOT NULL DEFAULT '',      -- 은행
  bank_account_enc text NOT NULL DEFAULT '',   -- 계좌번호
  account_holder_enc text NOT NULL DEFAULT '', -- 예금주

  id_card_path text,                           -- 신분증 파일 Storage 경로(influencer-contract-docs)
  id_card_name text,                           -- 원본 파일명(표시용)

  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.influencer_contract_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view contract settlements" ON public.influencer_contract_settlements;
CREATE POLICY "Approved users can view contract settlements"
  ON public.influencer_contract_settlements FOR SELECT TO authenticated
  USING (public.is_approved_user());
DROP POLICY IF EXISTS "Approved users can create contract settlements" ON public.influencer_contract_settlements;
CREATE POLICY "Approved users can create contract settlements"
  ON public.influencer_contract_settlements FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());
DROP POLICY IF EXISTS "Approved users can update contract settlements" ON public.influencer_contract_settlements;
CREATE POLICY "Approved users can update contract settlements"
  ON public.influencer_contract_settlements FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());
-- DELETE 정책 없음(의도) — 값 비우기는 UPDATE 로, 행 제거는 계약 하드 삭제 시 CASCADE 로만.
-- SELECT 가 승인 직원 전체에 열려 있어도 암호문만 보이므로 개인정보는 노출되지 않는다(106 vault_accounts 와 동일 모델).

DROP TRIGGER IF EXISTS influencer_contract_settlements_set_updated_at ON public.influencer_contract_settlements;
CREATE TRIGGER influencer_contract_settlements_set_updated_at
  BEFORE UPDATE ON public.influencer_contract_settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3) Storage: 신분증 파일 비공개 버킷 (10MB 제한)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('influencer-contract-docs', 'influencer-contract-docs', FALSE, 10485760)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Approved users can read contract docs" ON storage.objects;
CREATE POLICY "Approved users can read contract docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'influencer-contract-docs' AND public.is_approved_user());
DROP POLICY IF EXISTS "Approved users can upload contract docs" ON storage.objects;
CREATE POLICY "Approved users can upload contract docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'influencer-contract-docs' AND public.is_approved_user());
DROP POLICY IF EXISTS "Admins can delete contract docs" ON storage.objects;
CREATE POLICY "Admins can delete contract docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'influencer-contract-docs'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
