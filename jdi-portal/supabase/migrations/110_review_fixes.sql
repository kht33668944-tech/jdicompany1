-- ============================================
-- 110_review_fixes.sql
-- 코드 리뷰 후속 수정 (2026-07-27)
--
-- 1) reorder_task_checklist  : 체크리스트 순서 변경을 한 트랜잭션으로 처리
--                              (기존: 항목마다 개별 UPDATE + 오류를 아무도 확인하지 않음)
-- 2) next_task_position      : 할일 position 을 DB 에서 한 번에 계산
--                              (기존: 읽고→쓰는 사이 동시 생성 시 같은 번호 충돌)
-- 3) submit_timeline_review_remediation : 검토 보완 첨부 경로에 소유자 검증 추가
--                              (기존: 남의 파일 경로를 자기 자료로 등록 가능)
-- ============================================

-- ---------- 1. 체크리스트 순서 변경 ----------
CREATE OR REPLACE FUNCTION public.reorder_task_checklist(
  p_task_id UUID,
  p_item_ids UUID[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'User not approved';
  END IF;

  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- 전달된 항목이 모두 해당 할일의 것인지 확인 (다른 할일 항목 섞기 방지)
  IF EXISTS (
    SELECT 1
    FROM unnest(p_item_ids) AS req(id)
    LEFT JOIN public.task_checklist_items ci ON ci.id = req.id
    WHERE ci.id IS NULL OR ci.task_id <> p_task_id
  ) THEN
    RAISE EXCEPTION '체크리스트 항목이 올바르지 않습니다.';
  END IF;

  UPDATE public.task_checklist_items ci
  SET position = ord.idx - 1
  FROM unnest(p_item_ids) WITH ORDINALITY AS ord(id, idx)
  WHERE ci.id = ord.id
    AND ci.task_id = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_task_checklist(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_task_checklist(UUID, UUID[]) TO authenticated;

-- ---------- 2. 할일 다음 position ----------
CREATE OR REPLACE FUNCTION public.next_task_position(p_status TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'User not approved';
  END IF;

  SELECT COALESCE(MAX(position), -1) + 1 INTO v_next
  FROM public.tasks
  WHERE status = p_status;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.next_task_position(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_task_position(TEXT) TO authenticated;

-- ---------- 3. 검토 보완 첨부 소유자 검증 ----------
-- 109 의 함수를 그대로 두고 첨부 루프에만 경로 검증을 추가한다.
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

  IF v_rev.author_id <> v_uid THEN
    RAISE EXCEPTION '보완은 작성자만 제출할 수 있습니다.';
  END IF;

  IF v_rev.state <> 'open' THEN
    RAISE EXCEPTION '지금은 보완을 제출할 수 없습니다.';
  END IF;

  v_has_attachments := jsonb_typeof(p_attachments) = 'array'
    AND jsonb_array_length(p_attachments) > 0;

  v_note := btrim(COALESCE(p_note, ''));
  IF v_note = '' AND NOT v_has_attachments THEN
    RAISE EXCEPTION '보완 내용이나 파일을 올려 주세요.';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE EXCEPTION '보완 내용은 2000자 이하로 입력해 주세요.';
  END IF;

  UPDATE public.work_timeline_reviews
    SET state = 'submitted', updated_at = NOW()
    WHERE id = p_review_id;

  INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind, note)
  VALUES (p_review_id, v_uid, 'submitted', NULLIF(v_note, ''))
  RETURNING id INTO v_event_id;

  IF v_has_attachments THEN
    FOR v_att IN SELECT * FROM jsonb_array_elements(p_attachments)
    LOOP
      v_file_name := btrim(COALESCE(v_att->>'file_name', ''));
      v_file_path := btrim(COALESCE(v_att->>'file_path', ''));
      IF v_file_name = '' OR v_file_path = '' THEN
        RAISE EXCEPTION '첨부 정보가 올바르지 않습니다.';
      END IF;

      -- 경로는 반드시 `{작성자 id}/{업무보고 id}/{파일명}` 이어야 한다.
      -- (남의 스토리지 경로를 자기 보완 자료로 등록하는 것을 막는다)
      IF split_part(v_file_path, '/', 1) <> v_uid::text
         OR split_part(v_file_path, '/', 2) <> v_rev.entry_id::text
         OR split_part(v_file_path, '/', 3) = ''
         OR array_length(string_to_array(v_file_path, '/'), 1) <> 3 THEN
        RAISE EXCEPTION '첨부 파일 경로가 올바르지 않습니다.';
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
