-- 121_influencer_contracts_ops.sql
-- TMA 계약 운영 편의: 지출 자동 기록 연결 고리 + 아침 임박 알림
--
-- 배경
--  1) 계약 상태가 '정산 완료'로 바뀌면 광고비·추가비용을 지출관리에 자동 기록한다.
--     중복 기록을 막기 위해 계약 → 지출 연결 컬럼(expense_id)을 둔다(앱 서버 액션이 기록).
--  2) 평일 오전 9시(KST), 3일 이내 임박했거나 지난 일정(제품 발송/초안/게시 예정)이
--     있으면 승인 직원 전원에게 요약 알림 1건을 보낸다(105 업무지시 재촉 패턴).
--     푸시 발송은 기존 notifications 경로를 타며, push-dispatch 에
--     'influencer_contract_reminder' 타입이 등록되어 있어야 한다(같은 커밋에서 처리).
--
-- 설계서: docs/superpowers/specs/2026-08-12-influencer-contracts-design.md
--
-- 롤백
--   SELECT cron.unschedule('influencer_contract_reminder');
--   DROP FUNCTION IF EXISTS public.remind_influencer_contracts();
--   ALTER TABLE public.influencer_contracts DROP COLUMN IF EXISTS expense_id;

-- ============================================================
-- 1) 지출 연결 컬럼 (지출이 지워져도 계약은 남는다)
-- ============================================================
ALTER TABLE public.influencer_contracts
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

-- ============================================================
-- 2) 아침 임박 알림
--    화면과 같은 억제 규칙: 해당 단계를 이미 지난 계약은 세지 않는다.
-- ============================================================
CREATE OR REPLACE FUNCTION public.remind_influencer_contracts()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_soon DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE + 3;
  v_ship INT;
  v_draft INT;
  v_post INT;
  v_total INT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  SELECT COUNT(*) INTO v_ship
    FROM public.influencer_contracts
   WHERE is_deleted = FALSE
     AND product_ship_date IS NOT NULL AND product_ship_date <= v_soon
     AND contract_status IN ('candidate','dm_sent','negotiating','contract_sent','signed');

  SELECT COUNT(*) INTO v_draft
    FROM public.influencer_contracts
   WHERE is_deleted = FALSE
     AND draft_due_date IS NOT NULL AND draft_due_date <= v_soon
     AND contract_status IN ('candidate','dm_sent','negotiating','contract_sent','signed','product_shipped');

  SELECT COUNT(*) INTO v_post
    FROM public.influencer_contracts
   WHERE is_deleted = FALSE
     AND post_planned_date IS NOT NULL AND post_planned_date <= v_soon
     AND post_actual_date IS NULL
     AND contract_status IN ('candidate','dm_sent','negotiating','contract_sent','signed','product_shipped','draft_received');

  v_total := v_ship + v_draft + v_post;
  IF v_total = 0 THEN
    RETURN; -- 챙길 일이 없는 날은 조용히
  END IF;

  v_title := '🎄 TMA 계약 챙길 일 ' || v_total || '건';
  v_body := '제품 발송 ' || v_ship || '건 · 초안 ' || v_draft || '건 · 게시 예정 ' || v_post
    || '건 — 3일 이내 임박했거나 지난 일정이에요.';

  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT p.id, 'influencer_contract_reminder', v_title, v_body, '/dashboard/influencer/contracts'
    FROM public.profiles p
   WHERE p.is_approved = TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.remind_influencer_contracts() FROM PUBLIC;

-- 재적용에도 안전하게: 같은 이름의 기존 작업이 있으면 내리고 다시 등록
DO $$
BEGIN
  PERFORM cron.unschedule('influencer_contract_reminder');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- 평일 09:00 KST = 00:00 UTC
SELECT cron.schedule(
  'influencer_contract_reminder',
  '0 0 * * 1-5',
  $$ SELECT public.remind_influencer_contracts(); $$
);
