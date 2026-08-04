-- ============================================================
-- 118: 업무보고 검토 v3 — "내가 검토를 요청하는" 방향 추가
--   설계: docs/superpowers/specs/2026-08-04-work-timeline-review-request-direction-design.md
--   계획: docs/superpowers/plans/2026-08-04-work-timeline-review-request-direction.md
--   선행: 108(v1) / 109(v2) / 110(보완 첨부 소유자 검증) — 모두 원격 적용됨, 수정 금지
--
--   요지: 요청자 칸(requested_by)을 추가해 두 방향을 한 상태 머신에 담는다.
--     - 지시형(기존)   : 관리자가 남의 업무보고에 보완을 지시   → state 'open'   에서 시작
--     - 확인요청형(신규): 작성자가 검토자를 지정해 확인을 요청 → state 'submitted' 에서 시작
--   반려되면 둘 다 'open' 으로 내려와 기존 보완 흐름에 합류하므로
--   승인/반려/보완 제출 로직은 그대로 재사용한다.
-- ============================================================

-- ---------- 1. 요청자 칸 ----------
-- v1/v2 에서는 "요청자 = 검토자" 였으므로 기존 행은 reviewer_id 로 백필하면 의미가 정확히 보존된다.
ALTER TABLE public.work_timeline_reviews
  ADD COLUMN IF NOT EXISTS requested_by UUID
    REFERENCES public.profiles(id) ON DELETE CASCADE;

UPDATE public.work_timeline_reviews
  SET requested_by = reviewer_id
  WHERE requested_by IS NULL;

ALTER TABLE public.work_timeline_reviews
  ALTER COLUMN requested_by SET NOT NULL;

COMMENT ON COLUMN public.work_timeline_reviews.requested_by IS
  '검토를 요청한 사람. requested_by = author_id 이면 작성자가 확인을 요청한 것(확인요청형), 아니면 관리자 지시형.';

-- ---------- 2. 검토 요청 (인자 3개로 교체) ----------
-- DEFAULT 로 3인자를 얹으면 구 2인자 버전과 오버로드가 공존해 2인자 호출이 모호해진다.
-- 반드시 먼저 지운다.
DROP FUNCTION IF EXISTS public.request_timeline_review(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.request_timeline_review(
  p_entry_id UUID,
  p_comment TEXT,
  p_reviewer_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_entry public.work_timeline_entries%ROWTYPE;
  v_is_admin BOOLEAN;
  v_is_self_request BOOLEAN;
  v_comment TEXT;
  v_reviewer_id UUID;
  v_author_id UUID;
  v_state TEXT;
  v_notify_user_id UUID;
  v_review_id UUID;
  v_requester_name TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_approved = true) THEN
    RAISE EXCEPTION '승인된 사용자만 사용할 수 있습니다.';
  END IF;

  SELECT * INTO v_entry FROM public.work_timeline_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '업무보고를 찾을 수 없습니다.';
  END IF;

  v_comment := btrim(COALESCE(p_comment, ''));
  IF char_length(v_comment) > 2000 THEN
    RAISE EXCEPTION '검토 의견은 2000자 이하로 입력해 주세요.';
  END IF;

  v_is_admin := EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role = 'admin');
  v_is_self_request := (v_entry.user_id = v_uid);

  IF v_is_self_request THEN
    -- 확인요청형: 내 업무보고를 다른 사람에게 봐 달라고 요청한다.
    IF p_reviewer_id IS NULL THEN
      RAISE EXCEPTION '검토받을 사람을 선택해 주세요.';
    END IF;
    IF p_reviewer_id = v_uid THEN
      RAISE EXCEPTION '자기 자신에게는 검토를 요청할 수 없습니다.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = p_reviewer_id AND p.is_approved = true
    ) THEN
      RAISE EXCEPTION '검토받을 사람을 찾을 수 없습니다.';
    END IF;

    v_reviewer_id := p_reviewer_id;
    v_author_id := v_uid;
    -- 보완할 것이 없는 상태로 시작하므로 곧바로 검토자의 판정 대기로 들어간다.
    v_state := 'submitted';
    v_notify_user_id := p_reviewer_id;
    -- 테이블 CHECK 가 1자 이상을 요구하므로 비워 두면 기본 문구를 채운다.
    IF v_comment = '' THEN
      v_comment := '검토 부탁드립니다.';
    END IF;
  ELSE
    -- 지시형(기존 동작): 관리자가 남의 업무보고에 보완을 지시한다.
    IF NOT v_is_admin THEN
      RAISE EXCEPTION '검토를 요청할 권한이 없습니다.';
    END IF;
    IF v_comment = '' THEN
      RAISE EXCEPTION '검토 의견을 입력해 주세요.';
    END IF;

    v_reviewer_id := v_uid;
    v_author_id := v_entry.user_id;
    v_state := 'open';
    v_notify_user_id := v_entry.user_id;
  END IF;

  -- 진행 중 검토 1건 제한 (부분 유니크가 최종 방어, 여기서 친절한 메시지)
  IF EXISTS (
    SELECT 1 FROM public.work_timeline_reviews r
    WHERE r.entry_id = p_entry_id AND r.state IN ('open', 'submitted')
  ) THEN
    RAISE EXCEPTION '이미 진행 중인 검토가 있습니다.';
  END IF;

  INSERT INTO public.work_timeline_reviews
    (entry_id, reviewer_id, author_id, requested_by, comment, state)
  VALUES
    (p_entry_id, v_reviewer_id, v_author_id, v_uid, v_comment, v_state)
  RETURNING id INTO v_review_id;

  INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind, note)
  VALUES (v_review_id, v_uid, 'requested', v_comment);

  -- 상대에게 알림 (자기 자신에게는 보내지 않는다)
  IF v_notify_user_id <> v_uid THEN
    SELECT full_name INTO v_requester_name FROM public.profiles WHERE id = v_uid;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_notify_user_id,
      'timeline_review_requested',
      '검토 요청이 도착했어요',
      COALESCE(v_requester_name, '동료')
        || '님이 "' || v_entry.title || '"'
        || CASE WHEN v_is_self_request THEN ' 검토를 요청했습니다.' ELSE '에 검토 의견을 남겼습니다.' END,
      '/dashboard/work-timeline/' || p_entry_id
    );
  END IF;

  RETURN v_review_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_timeline_review(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_timeline_review(UUID, TEXT, UUID) TO authenticated;

-- ---------- 3. 취소 권한을 "요청한 사람" 기준으로 ----------
-- 기존(109)은 assert_can_resolve_review(검토자·관리자)로 판정했다. 확인요청형은 요청자가 검토자가
-- 아니므로 그대로 두면 직원이 자기가 보낸 요청을 취소할 수 없다.
CREATE OR REPLACE FUNCTION public.cancel_timeline_review(p_review_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rev public.work_timeline_reviews%ROWTYPE;
  v_canceller_name TEXT;
  v_notify_user_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  SELECT * INTO v_rev FROM public.work_timeline_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '검토를 찾을 수 없습니다.'; END IF;

  -- 요청한 사람 본인 또는 관리자만 취소할 수 있다.
  IF v_rev.requested_by <> v_uid
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role = 'admin'
     ) THEN
    RAISE EXCEPTION '이 검토를 취소할 권한이 없습니다.';
  END IF;

  IF v_rev.state NOT IN ('open', 'submitted') THEN
    RAISE EXCEPTION '이미 종료된 검토입니다.';
  END IF;

  UPDATE public.work_timeline_reviews
    SET state = 'cancelled', resolved_at = NOW(), updated_at = NOW()
    WHERE id = p_review_id;

  INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind)
  VALUES (p_review_id, v_uid, 'cancelled');

  -- 상대에게 알림: 취소한 사람이 작성자면 검토자에게, 아니면 작성자에게.
  v_notify_user_id := CASE
    WHEN v_rev.author_id = v_uid THEN v_rev.reviewer_id
    ELSE v_rev.author_id
  END;

  IF v_notify_user_id <> v_uid THEN
    SELECT full_name INTO v_canceller_name FROM public.profiles WHERE id = v_uid;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_notify_user_id, 'timeline_review_resolved', '검토 요청이 취소되었어요',
      COALESCE(v_canceller_name, '동료') || '님이 검토 요청을 취소했습니다.',
      '/dashboard/work-timeline/' || v_rev.entry_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_timeline_review(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_timeline_review(UUID) TO authenticated;
