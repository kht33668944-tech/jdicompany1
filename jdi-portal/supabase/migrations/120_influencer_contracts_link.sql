-- 120_influencer_contracts_link.sql
-- TMA 계약 ↔ 인플루언서 리스트/시딩 스케줄 연동 고리
--
-- 배경
--  * 계약 폼에서 이름을 치면 기존 리스트(influencers)에서 자동완성으로 고르고,
--    계약을 등록하면 시딩 스케줄(influencer_campaigns)에 캠페인이 자동으로 잡히게 한다.
--  * 동기화는 계약 → 스케줄 단방향(계약 화면이 원본). 앱 서버 액션이 수행하며
--    이 마이그레이션은 연결 컬럼만 추가한다.
--  * 리스트/캠페인이 지워져도 계약 기록은 남아야 하므로 둘 다 ON DELETE SET NULL.
--
-- 설계서: docs/superpowers/specs/2026-08-12-influencer-contracts-design.md
--
-- 롤백
--   ALTER TABLE public.influencer_contracts DROP COLUMN IF EXISTS influencer_id;
--   ALTER TABLE public.influencer_contracts DROP COLUMN IF EXISTS campaign_id;

ALTER TABLE public.influencer_contracts
  ADD COLUMN IF NOT EXISTS influencer_id uuid REFERENCES public.influencers(id) ON DELETE SET NULL;

ALTER TABLE public.influencer_contracts
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.influencer_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_influencer_contracts_influencer
  ON public.influencer_contracts (influencer_id) WHERE influencer_id IS NOT NULL;
