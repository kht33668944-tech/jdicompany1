-- ============================================================
-- 109: 업무보고 검토 v2 (방향 전환 — 할일 연동 제거)
--   설계: docs/superpowers/specs/2026-07-24-work-timeline-review-design.md
--         (§"🔄 방향 전환 v2")
--   선행: 108_work_timeline_reviews.sql (이미 원격 적용 — 수정 금지)
--   요지: tasks 연동(자동 할일·완료 감지 트리거·역링크) 제거,
--         보완은 업무보고 검토 칸에서 글+파일 첨부로 직접 제출.
-- ============================================================

-- ---------- 1. 할일 연동 제거 ----------
DROP TRIGGER IF EXISTS tasks_sync_review_on_status ON public.tasks;
DROP FUNCTION IF EXISTS public.sync_review_on_task_status();
DROP INDEX IF EXISTS public.tasks_review_unique;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS review_id;
ALTER TABLE public.work_timeline_reviews DROP COLUMN IF EXISTS task_id;

-- ---------- 2. 검토 첨부 테이블 (보완 이벤트에 붙는 파일) ----------
CREATE TABLE public.work_timeline_review_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL
    REFERENCES public.work_timeline_review_events(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX work_timeline_review_attachments_event
  ON public.work_timeline_review_attachments (event_id);

ALTER TABLE public.work_timeline_review_attachments ENABLE ROW LEVEL SECURITY;

-- 첨부는 연결된 검토를 볼 수 있는 사람(당사자·관리자)만 조회
CREATE POLICY "검토첨부: 검토를 볼 수 있으면 조회"
  ON public.work_timeline_review_attachments FOR SELECT TO authenticated
  USING (
    public.is_approved_user()
    AND EXISTS (
      SELECT 1
      FROM public.work_timeline_review_events ev
      JOIN public.work_timeline_reviews r ON r.id = ev.review_id
      WHERE ev.id = work_timeline_review_attachments.event_id
        AND (
          r.reviewer_id = auth.uid()
          OR r.author_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
          )
        )
    )
  );

-- INSERT/UPDATE/DELETE 정책은 만들지 않는다.
-- 모든 쓰기는 아래 RPC(SECURITY DEFINER)로만 가능하다.

-- ---------- 3. 검토 요청 (할일 로직 제거) ----------
CREATE OR REPLACE FUNCTION public.request_timeline_review(p_entry_id UUID, p_comment TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_entry public.work_timeline_entries%ROWTYPE;
  v_is_admin BOOLEAN;
  v_comment TEXT;
  v_review_id UUID;
  v_reviewer_name TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_approved = true) THEN
    RAISE EXCEPTION '승인된 사용자만 사용할 수 있습니다.';
  END IF;

  v_comment := btrim(COALESCE(p_comment, ''));
  IF v_comment = '' THEN
    RAISE EXCEPTION '검토 의견을 입력해 주세요.';
  END IF;
  IF char_length(v_comment) > 2000 THEN
    RAISE EXCEPTION '검토 의견은 2000자 이하로 입력해 주세요.';
  END IF;

  SELECT * INTO v_entry FROM public.work_timeline_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '업무보고를 찾을 수 없습니다.';
  END IF;

  v_is_admin := EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role = 'admin');
  -- 권한: 관리자 또는 업무보고 작성자 본인
  IF NOT v_is_admin AND v_entry.user_id <> v_uid THEN
    RAISE EXCEPTION '검토를 요청할 권한이 없습니다.';
  END IF;

  -- 진행 중 검토 1건 제한 (부분 유니크가 최종 방어, 여기서 친절한 메시지)
  IF EXISTS (
    SELECT 1 FROM public.work_timeline_reviews r
    WHERE r.entry_id = p_entry_id AND r.state IN ('open', 'submitted')
  ) THEN
    RAISE EXCEPTION '이미 진행 중인 검토가 있습니다.';
  END IF;

  INSERT INTO public.work_timeline_reviews (entry_id, reviewer_id, author_id, comment, state)
  VALUES (p_entry_id, v_uid, v_entry.user_id, v_comment, 'open')
  RETURNING id INTO v_review_id;

  INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind, note)
  VALUES (v_review_id, v_uid, 'requested', v_comment);

  -- 작성자에게 알림 (요청자 ≠ 작성자일 때)
  IF v_entry.user_id <> v_uid THEN
    SELECT full_name INTO v_reviewer_name FROM public.profiles WHERE id = v_uid;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_entry.user_id,
      'timeline_review_requested',
      '검토 요청이 도착했어요',
      COALESCE(v_reviewer_name, '검토자') || '님이 "' || v_entry.title || '"에 검토 의견을 남겼습니다.',
      '/dashboard/work-timeline/' || p_entry_id
    );
  END IF;

  RETURN v_review_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_timeline_review(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_timeline_review(UUID, TEXT) TO authenticated;

-- ---------- 4. 보완 제출 (작성자 — 트리거 대체) ----------
-- 작성자가 검토 칸에서 보완 내용(글) + 파일 첨부를 올리고 "보완 완료".
-- open -> submitted 로 전이하고 검토자에게 알림.
CREATE OR REPLACE FUNCTION public.submit_timeline_review_remediation(
  p_review_id UUID,
  p_note TEXT,
  p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rev public.work_timeline_reviews%ROWTYPE;
  v_note TEXT;
  v_has_attachments BOOLEAN;
  v_event_id UUID;
  v_att JSONB;
  v_file_name TEXT;
  v_file_path TEXT;
  v_author_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_approved = true) THEN
    RAISE EXCEPTION '승인된 사용자만 사용할 수 있습니다.';
  END IF;

  SELECT * INTO v_rev FROM public.work_timeline_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '검토를 찾을 수 없습니다.';
  END IF;

  -- 보완은 작성자만 제출
  IF v_rev.author_id <> v_uid THEN
    RAISE EXCEPTION '보완은 작성자만 제출할 수 있습니다.';
  END IF;

  IF v_rev.state <> 'open' THEN
    RAISE EXCEPTION '지금은 보완을 제출할 수 없습니다.';
  END IF;

  v_has_attachments := jsonb_typeof(p_attachments) = 'array'
    AND jsonb_array_length(p_attachments) > 0;

  v_note := btrim(COALESCE(p_note, ''));
  -- 글 또는 파일 중 최소 하나는 있어야 함
  IF v_note = '' AND NOT v_has_attachments THEN
    RAISE EXCEPTION '보완 내용이나 파일을 올려 주세요.';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE EXCEPTION '보완 내용은 2000자 이하로 입력해 주세요.';
  END IF;

  -- 상태 전이 open -> submitted
  UPDATE public.work_timeline_reviews
    SET state = 'submitted', updated_at = NOW()
    WHERE id = p_review_id;

  INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind, note)
  VALUES (p_review_id, v_uid, 'submitted', NULLIF(v_note, ''))
  RETURNING id INTO v_event_id;

  -- 첨부 저장
  IF v_has_attachments THEN
    FOR v_att IN SELECT * FROM jsonb_array_elements(p_attachments)
    LOOP
      v_file_name := btrim(COALESCE(v_att->>'file_name', ''));
      v_file_path := btrim(COALESCE(v_att->>'file_path', ''));
      IF v_file_name = '' OR v_file_path = '' THEN
        RAISE EXCEPTION '첨부 정보가 올바르지 않습니다.';
      END IF;
      INSERT INTO public.work_timeline_review_attachments
        (event_id, file_name, file_path, mime_type, file_size)
      VALUES (
        v_event_id,
        v_file_name,
        v_file_path,
        COALESCE(v_att->>'mime_type', 'application/octet-stream'),
        COALESCE((v_att->>'file_size')::integer, 0)
      );
    END LOOP;
  END IF;

  -- 검토자에게 알림 (검토자 ≠ 작성자일 때)
  IF v_rev.reviewer_id <> v_rev.author_id THEN
    SELECT full_name INTO v_author_name FROM public.profiles WHERE id = v_rev.author_id;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_rev.reviewer_id,
      'timeline_review_submitted',
      '보완이 완료됐어요',
      COALESCE(v_author_name, '작성자') || '님이 검토 보완을 올렸습니다. 확인해 주세요.',
      '/dashboard/work-timeline/' || v_rev.entry_id
    );
  END IF;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_timeline_review_remediation(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_timeline_review_remediation(UUID, TEXT, JSONB) TO authenticated;

-- ---------- 5. 반려 (재보완 루프 — 할일 재오픈 제거) ----------
CREATE OR REPLACE FUNCTION public.reject_timeline_review(p_review_id UUID, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rev public.work_timeline_reviews%ROWTYPE;
  v_note TEXT;
  v_reviewer_name TEXT;
BEGIN
  SELECT * INTO v_rev FROM public.work_timeline_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '검토를 찾을 수 없습니다.'; END IF;
  PERFORM public.assert_can_resolve_review(v_rev);
  IF v_rev.state <> 'submitted' THEN
    RAISE EXCEPTION '보완이 완료된 검토만 반려할 수 있습니다.';
  END IF;
  v_note := btrim(COALESCE(p_note, ''));
  IF v_note = '' THEN RAISE EXCEPTION '반려 사유를 입력해 주세요.'; END IF;

  -- 검토를 open으로 되돌린다 (보완 반복)
  UPDATE public.work_timeline_reviews
    SET state = 'open', updated_at = NOW()
    WHERE id = p_review_id;

  INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind, note)
  VALUES (p_review_id, v_uid, 'rejected', v_note);

  IF v_rev.author_id <> v_uid THEN
    SELECT full_name INTO v_reviewer_name FROM public.profiles WHERE id = v_uid;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_rev.author_id, 'timeline_review_resolved', '검토가 반려됐어요',
      COALESCE(v_reviewer_name, '검토자') || '님이 재보완을 요청했습니다. 사유: ' || v_note,
      '/dashboard/work-timeline/' || v_rev.entry_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_timeline_review(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_timeline_review(UUID, TEXT) TO authenticated;

-- ---------- 6. 요청 취소 (철회 — 할일 표기 제거) ----------
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
BEGIN
  SELECT * INTO v_rev FROM public.work_timeline_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '검토를 찾을 수 없습니다.'; END IF;
  PERFORM public.assert_can_resolve_review(v_rev);
  IF v_rev.state NOT IN ('open', 'submitted') THEN
    RAISE EXCEPTION '이미 종료된 검토입니다.';
  END IF;

  UPDATE public.work_timeline_reviews
    SET state = 'cancelled', resolved_at = NOW(), updated_at = NOW()
    WHERE id = p_review_id;

  INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind)
  VALUES (p_review_id, v_uid, 'cancelled');

  IF v_rev.author_id <> v_uid THEN
    SELECT full_name INTO v_canceller_name FROM public.profiles WHERE id = v_uid;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_rev.author_id, 'timeline_review_resolved', '검토 요청이 취소되었어요',
      COALESCE(v_canceller_name, '검토자') || '님이 검토 요청을 취소했습니다.',
      '/dashboard/work-timeline/' || v_rev.entry_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_timeline_review(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_timeline_review(UUID) TO authenticated;

-- approve_timeline_review / assert_can_resolve_review / remind_pending_timeline_reviews
--   는 108에서 할일을 건드리지 않으므로 그대로 둔다 (109에서 재정의하지 않음).
