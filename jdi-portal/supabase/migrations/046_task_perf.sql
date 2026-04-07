-- ============================================
-- 046_task_perf.sql
-- 할일 페이지 성능 개선
--   1) get_task_stats RPC: 4 round-trip → 1 (comment/attachment/subtask/checklist 통합)
--   2) get_my_tasks_with_details RPC: 사용자별 할일 + 담당자 + 통계 단일 쿼리
--   3) 누락 인덱스 추가
-- ============================================

-- ============================================
-- 1. 인덱스 추가 (성능 핫스팟)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_activities_task_type
  ON public.task_activities(task_id, type);

CREATE INDEX IF NOT EXISTS idx_attachments_task_id
  ON public.task_attachments(task_id);

CREATE INDEX IF NOT EXISTS idx_checklist_task_completed
  ON public.task_checklist_items(task_id, is_completed);

CREATE INDEX IF NOT EXISTS idx_tasks_status_parent
  ON public.tasks(status, parent_id);

CREATE INDEX IF NOT EXISTS idx_tasks_status_updated
  ON public.tasks(status, updated_at DESC);

-- ============================================
-- 2. get_task_stats: 단일 호출로 모든 카운트 반환
-- ============================================
CREATE OR REPLACE FUNCTION public.get_task_stats(p_task_ids UUID[])
RETURNS TABLE (
  task_id UUID,
  comment_count INT,
  attachment_count INT,
  subtask_count INT,
  checklist_total INT,
  checklist_completed INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    COALESCE((SELECT COUNT(*)::INT FROM public.task_activities a
              WHERE a.task_id = t.id AND a.type = 'comment'), 0),
    COALESCE((SELECT COUNT(*)::INT FROM public.task_attachments at
              WHERE at.task_id = t.id), 0),
    COALESCE((SELECT COUNT(*)::INT FROM public.tasks st
              WHERE st.parent_id = t.id), 0),
    COALESCE((SELECT COUNT(*)::INT FROM public.task_checklist_items ci
              WHERE ci.task_id = t.id), 0),
    COALESCE((SELECT COUNT(*)::INT FROM public.task_checklist_items ci
              WHERE ci.task_id = t.id AND ci.is_completed), 0)
  FROM public.tasks t
  WHERE t.id = ANY(p_task_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_task_stats(UUID[]) TO authenticated;

-- ============================================
-- 3. get_my_tasks_with_details: 내 할일만 단일 호출로 조회
--    (대시보드 홈 — 모든 할일 가져와서 클라이언트 필터링하던 것 대체)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_my_tasks_with_details(
  p_user_id UUID DEFAULT NULL,
  p_include_completed BOOLEAN DEFAULT true,
  p_completed_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_cutoff TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_cutoff := now() - (p_completed_days || ' days')::INTERVAL;

  WITH my_task_ids AS (
    SELECT DISTINCT t.id
      FROM public.tasks t
      JOIN public.task_assignees ta ON ta.task_id = t.id
     WHERE ta.user_id = v_user_id
       AND (
         t.status IN ('대기', '진행중')
         OR (p_include_completed AND t.status = '완료' AND t.updated_at >= v_cutoff)
       )
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.position), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        t.id, t.title, t.description, t.status, t.priority, t.category,
        t.due_date, t.start_date, t.position, t.parent_id, t.created_by,
        t.created_at, t.updated_at,
        (SELECT row_to_json(p) FROM (SELECT full_name, avatar_url FROM public.profiles WHERE id = t.created_by) p) AS creator_profile,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'user_id', ta.user_id,
            'full_name', p.full_name,
            'avatar_url', p.avatar_url
          ))
          FROM public.task_assignees ta
          JOIN public.profiles p ON p.id = ta.user_id
          WHERE ta.task_id = t.id
        ), '[]'::jsonb) AS assignees,
        COALESCE((SELECT COUNT(*)::INT FROM public.task_activities a WHERE a.task_id = t.id AND a.type='comment'), 0) AS comment_count,
        COALESCE((SELECT COUNT(*)::INT FROM public.task_attachments at WHERE at.task_id = t.id), 0) AS attachment_count,
        COALESCE((SELECT COUNT(*)::INT FROM public.tasks st WHERE st.parent_id = t.id), 0) AS subtask_count,
        COALESCE((SELECT COUNT(*)::INT FROM public.task_checklist_items ci WHERE ci.task_id = t.id), 0) AS checklist_total,
        COALESCE((SELECT COUNT(*)::INT FROM public.task_checklist_items ci WHERE ci.task_id = t.id AND ci.is_completed), 0) AS checklist_completed
      FROM public.tasks t
      WHERE t.id IN (SELECT id FROM my_task_ids)
    ) x;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_tasks_with_details(UUID, BOOLEAN, INT) TO authenticated;
