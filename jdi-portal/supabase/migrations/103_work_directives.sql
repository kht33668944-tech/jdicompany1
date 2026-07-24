-- ============================================================
-- 103: 업무지시 (work directives)
--   설계: docs/superpowers/specs/2026-07-24-work-directives-design.md
--   계획: docs/superpowers/plans/2026-07-24-work-directives.md
-- ============================================================

-- ---------- 지시 본문 ----------
CREATE TABLE public.work_directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  kind TEXT NOT NULL CHECK (kind IN ('지시', '요청')),
  priority TEXT CHECK (priority IS NULL OR priority IN ('긴급', '높음', '보통', '낮음')),
  due_date DATE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX work_directives_created_by
  ON public.work_directives (created_by, created_at DESC);

-- ---------- 받는 사람별 상태 ----------
CREATE TABLE public.work_directive_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  directive_id UUID NOT NULL REFERENCES public.work_directives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT '미확인' CHECK (state IN ('미확인', '수락', '거절')),
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  decline_reason TEXT CHECK (
    decline_reason IS NULL OR char_length(btrim(decline_reason)) BETWEEN 1 AND 500
  ),
  responded_at TIMESTAMPTZ,
  reminded_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (directive_id, user_id)
);

-- 대시보드가 매 요청 읽는 경로: 미확인 건만 부분 인덱스로 (전체 스캔 금지)
CREATE INDEX work_directive_recipients_pending
  ON public.work_directive_recipients (user_id, created_at DESC)
  WHERE state = '미확인';

CREATE INDEX work_directive_recipients_directive
  ON public.work_directive_recipients (directive_id);

CREATE INDEX work_directive_recipients_task
  ON public.work_directive_recipients (task_id)
  WHERE task_id IS NOT NULL;

-- ---------- 할일 연결 ----------
ALTER TABLE public.tasks
  ADD COLUMN directive_recipient_id UUID
    REFERENCES public.work_directive_recipients(id) ON DELETE SET NULL;

-- 한 수신 건에서 할일이 두 개 생기는 것(중복 수락)을 DB 가 막는다
CREATE UNIQUE INDEX tasks_directive_recipient_unique
  ON public.tasks (directive_recipient_id)
  WHERE directive_recipient_id IS NOT NULL;

-- ---------- kind 위조 방지 ----------
-- kind 는 클라이언트 입력이 아니라 보낸 사람의 권한에서 파생된다.
-- 앱에서 계산해 넣으면 직접 REST 호출로 '지시' 를 위조할 수 있으므로 DB 에서 덮어쓴다.
CREATE OR REPLACE FUNCTION public.set_work_directive_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
    NEW.kind := CASE
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      ) THEN '지시'
      ELSE '요청'
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_directives_set_kind
  BEFORE INSERT ON public.work_directives
  FOR EACH ROW EXECUTE FUNCTION public.set_work_directive_kind();

-- ---------- RLS ----------
ALTER TABLE public.work_directives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_directive_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "지시: 보낸 사람·받는 사람·관리자만 조회"
  ON public.work_directives FOR SELECT TO authenticated
  USING (
    public.is_approved_user()
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.work_directive_recipients r
        WHERE r.directive_id = work_directives.id AND r.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    )
  );

CREATE POLICY "지시: 승인 사용자 등록"
  ON public.work_directives FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());

CREATE POLICY "지시: 보낸 사람·관리자 삭제"
  ON public.work_directives FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "수신: 지시를 볼 수 있으면 조회"
  ON public.work_directive_recipients FOR SELECT TO authenticated
  USING (
    public.is_approved_user()
    AND EXISTS (
      SELECT 1 FROM public.work_directives d
      WHERE d.id = work_directive_recipients.directive_id
    )
  );

CREATE POLICY "수신: 지시를 만든 사람만 추가"
  ON public.work_directive_recipients FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user()
    AND EXISTS (
      SELECT 1 FROM public.work_directives d
      WHERE d.id = work_directive_recipients.directive_id
        AND d.created_by = auth.uid()
    )
  );

CREATE POLICY "수신: 보낸 사람·관리자 삭제"
  ON public.work_directive_recipients FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_directives d
      WHERE d.id = work_directive_recipients.directive_id
        AND d.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- UPDATE 정책은 일부러 만들지 않는다.
-- 상태 변경은 아래 두 RPC 로만 가능하다 (남이 대신 수락하는 것을 DB 에서 차단).

-- ---------- 수락 ----------
CREATE OR REPLACE FUNCTION public.accept_work_directive(p_recipient_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_rec public.work_directive_recipients%ROWTYPE;
  v_dir public.work_directives%ROWTYPE;
  v_task_id UUID;
  v_position INTEGER;
  v_actor_name TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_approved = true
  ) THEN
    RAISE EXCEPTION '승인된 사용자만 사용할 수 있습니다.';
  END IF;

  SELECT * INTO v_rec
  FROM public.work_directive_recipients
  WHERE id = p_recipient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '업무지시를 찾을 수 없습니다.';
  END IF;
  IF v_rec.user_id <> v_uid THEN
    RAISE EXCEPTION '본인에게 온 업무지시만 수락할 수 있습니다.';
  END IF;
  IF v_rec.state <> '미확인' THEN
    RAISE EXCEPTION '이미 응답한 지시입니다.';
  END IF;

  SELECT * INTO v_dir FROM public.work_directives WHERE id = v_rec.directive_id;

  -- 상태별 독립 순서 (src/components/dashboard/tasks/CLAUDE.md)
  SELECT COALESCE(MAX(t.position), 0) + 1 INTO v_position
  FROM public.tasks t
  WHERE t.status = '대기';

  INSERT INTO public.tasks (
    title, description, status, priority, due_date, project_id,
    position, created_by, directive_recipient_id
  ) VALUES (
    v_dir.title,
    v_dir.body,
    '대기',
    COALESCE(v_dir.priority, '보통'),
    v_dir.due_date,
    v_dir.project_id,
    v_position,
    v_dir.created_by,
    v_rec.id
  )
  RETURNING id INTO v_task_id;

  INSERT INTO public.task_assignees (task_id, user_id)
  VALUES (v_task_id, v_uid);

  UPDATE public.work_directive_recipients
  SET state = '수락', task_id = v_task_id, responded_at = NOW()
  WHERE id = v_rec.id;

  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_uid;

  IF v_dir.created_by <> v_uid THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_dir.created_by,
      'work_directive_answer',
      '업무지시를 수락했습니다',
      COALESCE(v_actor_name, '동료') || '님이 "' || v_dir.title || '" 을(를) 수락했습니다.',
      '/dashboard'
    );
  END IF;

  RETURN v_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_work_directive(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_work_directive(UUID) TO authenticated;

-- ---------- 거절 ----------
CREATE OR REPLACE FUNCTION public.decline_work_directive(p_recipient_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_rec public.work_directive_recipients%ROWTYPE;
  v_dir public.work_directives%ROWTYPE;
  v_reason TEXT;
  v_actor_name TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_approved = true
  ) THEN
    RAISE EXCEPTION '승인된 사용자만 사용할 수 있습니다.';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION '거절 사유를 입력해 주세요.';
  END IF;

  SELECT * INTO v_rec
  FROM public.work_directive_recipients
  WHERE id = p_recipient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '업무지시를 찾을 수 없습니다.';
  END IF;
  IF v_rec.user_id <> v_uid THEN
    RAISE EXCEPTION '본인에게 온 업무지시만 응답할 수 있습니다.';
  END IF;
  IF v_rec.state <> '미확인' THEN
    RAISE EXCEPTION '이미 응답한 지시입니다.';
  END IF;

  SELECT * INTO v_dir FROM public.work_directives WHERE id = v_rec.directive_id;
  IF v_dir.kind = '지시' THEN
    RAISE EXCEPTION '대표님 지시는 거절할 수 없습니다.';
  END IF;

  UPDATE public.work_directive_recipients
  SET state = '거절', decline_reason = v_reason, responded_at = NOW()
  WHERE id = v_rec.id;

  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_uid;

  IF v_dir.created_by <> v_uid THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_dir.created_by,
      'work_directive_answer',
      '업무 요청이 거절되었습니다',
      COALESCE(v_actor_name, '동료') || '님이 "' || v_dir.title || '" 을(를) 거절했습니다. 사유: ' || v_reason,
      '/dashboard'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_work_directive(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_work_directive(UUID, TEXT) TO authenticated;
