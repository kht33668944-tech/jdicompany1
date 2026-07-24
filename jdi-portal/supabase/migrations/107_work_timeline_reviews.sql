-- ============================================================
-- 107: 업무보고 검토 (work timeline reviews)
--   설계: docs/superpowers/specs/2026-07-24-work-timeline-review-design.md
--   계획: docs/superpowers/plans/2026-07-24-work-timeline-review.md
--   선례: 103_work_directives.sql (동일 패턴)
-- ============================================================

-- ---------- 검토 본문·상태 ----------
CREATE TABLE public.work_timeline_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.work_timeline_entries(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  comment TEXT NOT NULL CHECK (char_length(btrim(comment)) BETWEEN 1 AND 2000),
  state TEXT NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'submitted', 'approved', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  reminded_on DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 업무보고당 진행 중(open/submitted) 검토는 1건만
CREATE UNIQUE INDEX work_timeline_reviews_active_unique
  ON public.work_timeline_reviews (entry_id)
  WHERE state IN ('open', 'submitted');

-- 대시보드/재촉이 매번 읽는 경로: 부분 인덱스 (전체 스캔 금지)
CREATE INDEX work_timeline_reviews_author_open
  ON public.work_timeline_reviews (author_id, created_at DESC)
  WHERE state = 'open';
CREATE INDEX work_timeline_reviews_reviewer_submitted
  ON public.work_timeline_reviews (reviewer_id, created_at DESC)
  WHERE state = 'submitted';
CREATE INDEX work_timeline_reviews_entry
  ON public.work_timeline_reviews (entry_id, created_at DESC);

-- ---------- 이력 타임라인 ----------
CREATE TABLE public.work_timeline_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.work_timeline_reviews(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('requested', 'submitted', 'approved', 'rejected', 'cancelled')),
  note TEXT CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX work_timeline_review_events_review
  ON public.work_timeline_review_events (review_id, created_at);

-- ---------- 할일 연결 ----------
ALTER TABLE public.tasks
  ADD COLUMN review_id UUID
    REFERENCES public.work_timeline_reviews(id) ON DELETE SET NULL;

-- 검토 1건당 보완 할일 1개 보장
CREATE UNIQUE INDEX tasks_review_unique
  ON public.tasks (review_id)
  WHERE review_id IS NOT NULL;

-- ---------- RLS ----------
ALTER TABLE public.work_timeline_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_timeline_review_events ENABLE ROW LEVEL SECURITY;

-- 검토 의견은 당사자(요청자·작성자)와 관리자만 조회
CREATE POLICY "검토: 당사자·관리자 조회"
  ON public.work_timeline_reviews FOR SELECT TO authenticated
  USING (
    public.is_approved_user()
    AND (
      reviewer_id = auth.uid()
      OR author_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    )
  );

CREATE POLICY "검토이력: 검토를 볼 수 있으면 조회"
  ON public.work_timeline_review_events FOR SELECT TO authenticated
  USING (
    public.is_approved_user()
    AND EXISTS (
      SELECT 1 FROM public.work_timeline_reviews r
      WHERE r.id = work_timeline_review_events.review_id
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

-- ---------- 보완 할일 완료 감지 ----------
-- 검토와 연결된 할일(review_id)의 status 변화를 감지해 검토 상태를 자동 전이한다.
CREATE OR REPLACE FUNCTION public.sync_review_on_task_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rev public.work_timeline_reviews%ROWTYPE;
  v_author_name TEXT;
BEGIN
  IF NEW.review_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 완료 진입: open -> submitted
  IF NEW.status = '완료' AND (OLD.status IS DISTINCT FROM '완료') THEN
    UPDATE public.work_timeline_reviews
      SET state = 'submitted', updated_at = NOW()
      WHERE id = NEW.review_id AND state = 'open'
      RETURNING * INTO v_rev;

    IF FOUND THEN
      INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind)
      VALUES (v_rev.id, v_rev.author_id, 'submitted');

      SELECT full_name INTO v_author_name FROM public.profiles WHERE id = v_rev.author_id;

      IF v_rev.reviewer_id <> v_rev.author_id THEN
        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (
          v_rev.reviewer_id,
          'timeline_review_submitted',
          '보완이 완료됐어요',
          COALESCE(v_author_name, '작성자') || '님이 검토 보완을 끝냈습니다. 확인해 주세요.',
          '/dashboard/work-timeline/' || v_rev.entry_id
        );
      END IF;
    END IF;

  -- 완료 이탈(재오픈): submitted -> open (정합성 유지)
  ELSIF OLD.status = '완료' AND NEW.status <> '완료' THEN
    UPDATE public.work_timeline_reviews
      SET state = 'open', updated_at = NOW()
      WHERE id = NEW.review_id AND state = 'submitted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_sync_review_on_status
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_review_on_task_status();

-- ---------- 검토 요청 ----------
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
  v_task_id UUID;
  v_position INTEGER;
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

  -- 보완 할일 생성 (상태별 독립 순서 — tasks CLAUDE.md)
  SELECT COALESCE(MAX(t.position), 0) + 1 INTO v_position FROM public.tasks t WHERE t.status = '대기';

  INSERT INTO public.tasks (title, description, status, priority, position, created_by, review_id)
  VALUES (
    '[검토 보완] ' || v_entry.title,
    v_comment,
    '대기',
    '보통',
    v_position,
    v_uid,
    v_review_id
  )
  RETURNING id INTO v_task_id;

  INSERT INTO public.task_assignees (task_id, user_id) VALUES (v_task_id, v_entry.user_id);

  UPDATE public.work_timeline_reviews SET task_id = v_task_id WHERE id = v_review_id;

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

-- ---------- 공통: 검토자·관리자 권한 확인 헬퍼 ----------
CREATE OR REPLACE FUNCTION public.assert_can_resolve_review(p_review public.work_timeline_reviews)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF p_review.reviewer_id <> v_uid
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role = 'admin') THEN
    RAISE EXCEPTION '이 검토를 처리할 권한이 없습니다.';
  END IF;
END;
$$;

-- ---------- 승인 ----------
CREATE OR REPLACE FUNCTION public.approve_timeline_review(p_review_id UUID, p_note TEXT DEFAULT NULL)
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
    RAISE EXCEPTION '보완이 완료된 검토만 승인할 수 있습니다.';
  END IF;
  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');

  UPDATE public.work_timeline_reviews
    SET state = 'approved', resolved_at = NOW(), updated_at = NOW()
    WHERE id = p_review_id;

  INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind, note)
  VALUES (p_review_id, v_uid, 'approved', v_note);

  IF v_rev.author_id <> v_uid THEN
    SELECT full_name INTO v_reviewer_name FROM public.profiles WHERE id = v_uid;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_rev.author_id, 'timeline_review_resolved', '검토가 승인됐어요',
      COALESCE(v_reviewer_name, '검토자') || '님이 검토를 승인했습니다.',
      '/dashboard/work-timeline/' || v_rev.entry_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_timeline_review(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_timeline_review(UUID, TEXT) TO authenticated;

-- ---------- 반려 (재보완 루프) ----------
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
  v_position INTEGER;
BEGIN
  SELECT * INTO v_rev FROM public.work_timeline_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '검토를 찾을 수 없습니다.'; END IF;
  PERFORM public.assert_can_resolve_review(v_rev);
  IF v_rev.state <> 'submitted' THEN
    RAISE EXCEPTION '보완이 완료된 검토만 반려할 수 있습니다.';
  END IF;
  v_note := btrim(COALESCE(p_note, ''));
  IF v_note = '' THEN RAISE EXCEPTION '반려 사유를 입력해 주세요.'; END IF;

  -- 검토를 open으로 되돌린다
  UPDATE public.work_timeline_reviews
    SET state = 'open', updated_at = NOW()
    WHERE id = p_review_id;

  -- 연결 할일을 대기로 재오픈 (트리거는 open->이미 처리했으므로 여기서 직접).
  -- 주의: 이 UPDATE가 sync_review_on_task_status를 다시 타지만 status가 '완료'->'대기'이고
  -- 검토는 이미 open이라 재전이 조건(submitted)에 걸리지 않아 무한루프 없음.
  SELECT COALESCE(MAX(t.position), 0) + 1 INTO v_position FROM public.tasks t WHERE t.status = '대기';
  IF v_rev.task_id IS NOT NULL THEN
    UPDATE public.tasks SET status = '대기', position = v_position WHERE id = v_rev.task_id;
  END IF;

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

-- ---------- 요청 취소 (철회) ----------
CREATE OR REPLACE FUNCTION public.cancel_timeline_review(p_review_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rev public.work_timeline_reviews%ROWTYPE;
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

  -- 보완 할일은 남기되 검토 취소 표시 (열린 질문 결정: 남김 + 제목 표기)
  IF v_rev.task_id IS NOT NULL THEN
    UPDATE public.tasks
      SET title = title || ' (검토 취소)'
      WHERE id = v_rev.task_id AND title NOT LIKE '%(검토 취소)';
  END IF;

  INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind)
  VALUES (p_review_id, v_uid, 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_timeline_review(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_timeline_review(UUID) TO authenticated;

-- ---------- 미확인/미처리 검토 재촉 (평일 1회) ----------
CREATE OR REPLACE FUNCTION public.remind_pending_timeline_reviews()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_rev RECORD;
BEGIN
  FOR v_rev IN
    SELECT r.*, e.title AS entry_title
    FROM public.work_timeline_reviews r
    JOIN public.work_timeline_entries e ON e.id = r.entry_id
    WHERE r.state IN ('open', 'submitted')
      AND r.created_at < NOW() - INTERVAL '12 hours'
      AND (r.reminded_on IS NULL OR r.reminded_on < v_today)
  LOOP
    -- open: 작성자에게 "보완이 필요합니다" (작성자가 오늘 출근한 경우만)
    IF v_rev.state = 'open' THEN
      IF EXISTS (
        SELECT 1 FROM public.attendance_records a
        WHERE a.user_id = v_rev.author_id AND a.work_date = v_today AND a.status <> '미출근'
      ) THEN
        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (v_rev.author_id, 'timeline_review_requested', '검토 보완이 남아 있어요',
          '"' || v_rev.entry_title || '" 검토 보완이 아직 남아 있습니다.',
          '/dashboard/work-timeline/' || v_rev.entry_id);
        UPDATE public.work_timeline_reviews SET reminded_on = v_today WHERE id = v_rev.id;
      END IF;
    -- submitted: 검토자에게 "확인해 주세요" (검토자가 오늘 출근한 경우만)
    ELSIF v_rev.state = 'submitted' THEN
      IF EXISTS (
        SELECT 1 FROM public.attendance_records a
        WHERE a.user_id = v_rev.reviewer_id AND a.work_date = v_today AND a.status <> '미출근'
      ) THEN
        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (v_rev.reviewer_id, 'timeline_review_submitted', '확인할 검토가 있어요',
          '"' || v_rev.entry_title || '" 보완이 완료되어 확인을 기다립니다.',
          '/dashboard/work-timeline/' || v_rev.entry_id);
        UPDATE public.work_timeline_reviews SET reminded_on = v_today WHERE id = v_rev.id;
      END IF;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.remind_pending_timeline_reviews() FROM PUBLIC;

-- 평일 11:30 KST = UTC 02:30 (업무지시 11:00과 겹치지 않게)
SELECT cron.schedule('timeline_review_reminder', '30 2 * * 1-5',
  'SELECT public.remind_pending_timeline_reviews();');
