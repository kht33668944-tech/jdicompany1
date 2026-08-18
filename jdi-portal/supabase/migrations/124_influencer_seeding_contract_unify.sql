-- 124: 인플루언서 탭 3화면(리스트·시딩 스케줄·TMA 계약) 연동 통일
--
-- 배경
--   시딩건(influencer_campaigns)과 계약(influencer_contracts)이 1:1로 묶여 있지 않아
--   ① 계약을 저장할 때마다 같은 사람 시딩건이 하나 더 생기고(이름까지 동일)
--   ② 계약을 지워도 시딩건이 유령으로 남아 KPI·깔때기·스케줄에 계속 잡혔다.
--   코드 쪽은 linkSync.ts 에서 흡수·삭제로 막았고, 여기서는 이미 어긋난 데이터를 정리하고
--   "계약 1건 = 시딩건 1건" 을 DB 차원에서 고정한다.
--
-- 삭제 범위 (2026-08-18 운영자 확인 — 지금까지 쌓인 계약·시딩건은 전부 테스트용)
--   지움 : influencer_contract_documents / influencer_contract_settlements /
--          influencer_contracts / influencer_campaigns
--   보존 : influencer_contract_templates (TMA 계약서 양식)  ← 절대 지우지 않는다
--          influencers (인플루언서 96명), influencer_posts,
--          company_contract_* (별도 「계약관리」 메뉴), expenses / expense_categories
--
-- 되돌리기: 삭제된 행은 복구할 수 없다. 인덱스만 되돌리려면
--   DROP INDEX IF EXISTS public.influencer_contracts_campaign_id_key;

-- ============================================================
-- 1) 테스트 데이터 정리
-- ============================================================

-- 자식 → 부모 순서. influencer_contract_documents/_settlements 는 계약을 참조한다.
DELETE FROM public.influencer_contract_documents;
DELETE FROM public.influencer_contract_settlements;
DELETE FROM public.influencer_contracts;

-- 시딩건. influencer_campaign_events 는 ON DELETE CASCADE 로 함께 정리된다(마이그 111).
DELETE FROM public.influencer_campaigns;

-- ============================================================
-- 2) 고아 파일 정리 — 신분증·서명 PDF 는 계약이 사라지면 참조가 없어진다.
--    회사 도장(company/stamp.png)은 계약과 무관한 공용 자산이라 반드시 남긴다.
--    권한 문제로 실패하더라도 위의 데이터 정리는 유지되도록 예외를 삼킨다.
-- ============================================================
DO $$
BEGIN
  DELETE FROM storage.objects
   WHERE bucket_id = 'influencer-contract-docs'
     AND name NOT LIKE 'company/%';
EXCEPTION
  WHEN insufficient_privilege OR undefined_table THEN
    RAISE NOTICE '[124] storage.objects 정리를 건너뜁니다(권한 없음).';
END $$;

-- ============================================================
-- 3) 계약 1건 = 시딩건 1건 고정
--    두 계약이 같은 시딩건을 물어 상태가 서로 덮어쓰는 일을 DB에서 막는다.
--    campaign_id 가 NULL 인 계약(아직 동기화 전)은 여러 건이어도 되므로 부분 인덱스.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS influencer_contracts_campaign_id_key
    ON public.influencer_contracts (campaign_id)
 WHERE campaign_id IS NOT NULL;
