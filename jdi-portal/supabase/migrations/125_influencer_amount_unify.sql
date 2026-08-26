-- 125: 인플루언서 리스트 「계약 금액」 = TMA 계약 「금액」 통일
--
-- 배경
--   같은 금액을 두 곳에 저장하고 있었다.
--     · influencer_contracts.ad_fee_total / agreed_value  ← 계약서에 적히는 진짜 값
--     · influencer_campaigns.cost                          ← 시딩건에 남기는 사본
--   사본은 계약을 "포털에서 저장할 때"만 갱신된다(linkSync.syncCampaign). 그래서 계약 금액을
--   나중에 채우거나 스크립트로 직접 고치면 사본이 뒤처졌고, 리스트에는 「—」, 계약 탭에는
--   250,000원 처럼 서로 다른 숫자가 보였다(2026-08-26 시점 95건 중 21건).
--
-- 이 마이그레이션이 하는 일
--   1) 어긋난 사본을 계약 값으로 맞춘다(1회 보정).
--   2) 앞으로는 계약이 바뀌면 사본이 DB 차원에서 따라오도록 트리거를 건다.
--      포털 밖(스크립트·SQL 직접 수정)에서 고쳐도 어긋나지 않는다.
--
-- 금액 규칙 — 광고비형은 광고비 총액, 순수협찬형은 약정가액.
--   화면·서버 코드의 getContractAmount(src/lib/influencer/contracts/payout.ts) 와 같은 규칙이다.
--   한쪽만 바꾸면 다시 어긋나므로 항상 함께 고친다.
--
-- 되돌리기
--   DROP TRIGGER IF EXISTS influencer_contracts_sync_campaign_cost ON public.influencer_contracts;
--   DROP FUNCTION IF EXISTS public.sync_campaign_cost_from_contract();
--   (1번의 금액 보정은 되돌릴 필요가 없다 — 계약서 값으로 맞춘 것이라 이쪽이 옳다.)

-- ============================================================
-- 1) 어긋난 시딩건 금액 보정
-- ============================================================
UPDATE public.influencer_campaigns cp
   SET cost = CASE WHEN ct.collab_type = 'paid' THEN ct.ad_fee_total ELSE ct.agreed_value END
  FROM public.influencer_contracts ct
 WHERE ct.campaign_id = cp.id
   AND ct.is_deleted = FALSE
   AND cp.cost IS DISTINCT FROM
       (CASE WHEN ct.collab_type = 'paid' THEN ct.ad_fee_total ELSE ct.agreed_value END);

-- ============================================================
-- 2) 계약 → 시딩건 금액 자동 반영
--    SECURITY DEFINER 를 쓰지 않는다. 두 테이블 모두 is_approved_user() 로 열리므로
--    계약을 고칠 수 있는 사람은 시딩건도 고칠 수 있고, 호출자 권한 그대로가 안전하다.
--    (전자서명 완료 경로는 service role 이라 RLS 와 무관하게 통과한다.)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_campaign_cost_from_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_amount BIGINT;
BEGIN
  -- 삭제(소프트)된 계약은 사본을 건드리지 않는다. 취소·삭제 시 시딩건 자체를 지우는 일은
  -- 앱(linkSync.syncCampaign)이 맡고 있어, 여기서 0 으로 덮으면 이력만 망가진다.
  IF NEW.campaign_id IS NULL OR NEW.is_deleted THEN
    RETURN NEW;
  END IF;

  v_amount := CASE WHEN NEW.collab_type = 'paid' THEN NEW.ad_fee_total ELSE NEW.agreed_value END;

  UPDATE public.influencer_campaigns
     SET cost = v_amount
   WHERE id = NEW.campaign_id
     AND cost IS DISTINCT FROM v_amount;  -- 값이 같으면 쓰지 않는다(불필요한 갱신·되울림 방지)

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_campaign_cost_from_contract() IS
  '계약 금액(광고비형=ad_fee_total, 순수협찬형=agreed_value)을 연결된 시딩건 cost 에 반영. '
  '리스트·시딩 스케줄·계약 탭이 같은 숫자를 보이도록 하는 장치 — 마이그 125.';

DROP TRIGGER IF EXISTS influencer_contracts_sync_campaign_cost ON public.influencer_contracts;
CREATE TRIGGER influencer_contracts_sync_campaign_cost
AFTER INSERT OR UPDATE OF campaign_id, collab_type, ad_fee_total, agreed_value, is_deleted
    ON public.influencer_contracts
   FOR EACH ROW
EXECUTE FUNCTION public.sync_campaign_cost_from_contract();
