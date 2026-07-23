-- 102: 대시보드 "오늘 할 일" 요약에 프로젝트 정보(project_id, project) 추가
--
-- 배경:
--   101 에서 tasks.project_id 가 추가되어 할일 탭에서는 프로젝트 배지가 보이지만,
--   대시보드 요약 RPC(get_dashboard_task_summaries)는 프로젝트를 싣지 않아
--   메인 대시보드 "오늘 할 일" 목록에는 배지가 나오지 않았다.
--
-- 변경:
--   분류/정렬/사전 필터(088~089)는 그대로 두고, 결과 jsonb 에
--   'project_id' 와 'project'(id, name, color) 만 추가한다.
--   프로젝트 조회는 PK 단건 서브쿼리라 성능 특성은 089 와 동일하다.
--
-- 롤백:
--   함수는 089 정의로 CREATE OR REPLACE 하면 되돌아간다.

CREATE OR REPLACE FUNCTION public.get_dashboard_task_summaries(
  p_day_start timestamptz,
  p_next_day_start timestamptz,
  p_limit integer DEFAULT 101
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_limit integer;
  v_today date;
  v_next_day date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'DASHBOARD_REQUESTER_NOT_APPROVED' USING ERRCODE = '42501';
  END IF;

  IF p_day_start IS NULL OR p_next_day_start IS NULL
    OR p_day_start >= p_next_day_start
    OR (p_day_start AT TIME ZONE 'Asia/Seoul')::time <> time '00:00:00'
    OR (p_next_day_start AT TIME ZONE 'Asia/Seoul')::time <> time '00:00:00'
    OR (p_next_day_start AT TIME ZONE 'Asia/Seoul')::date
      <> (p_day_start AT TIME ZONE 'Asia/Seoul')::date + 1 THEN
    RAISE EXCEPTION 'DASHBOARD_INVALID_DAY_WINDOW' USING ERRCODE = '22023';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 101), 1), 101);
  v_today := (p_day_start AT TIME ZONE 'Asia/Seoul')::date;
  v_next_day := (p_next_day_start AT TIME ZONE 'Asia/Seoul')::date;

  RETURN (
    WITH classified_task_rows AS (
      SELECT
        t.id,
        t.title,
        t.status,
        t.priority,
        t.due_date,
        t.start_date,
        t.position,
        t.parent_id,
        t.project_id,
        t.created_by,
        t.created_at,
        t.updated_at,
        t.completed_at,
        CASE
          WHEN t.status IN ('대기', '진행중')
            AND t.due_date IS NOT NULL AND t.due_date < v_today THEN 0
          WHEN t.status IN ('대기', '진행중')
            AND t.due_date = v_today THEN 1
          WHEN t.status IN ('대기', '진행중')
            AND t.due_date IS NOT NULL AND t.due_date > v_today THEN 2
          WHEN t.status IN ('대기', '진행중')
            AND t.start_date IS NOT NULL
            AND t.start_date < v_next_day THEN 3
          WHEN t.status IN ('대기', '진행중')
            AND t.due_date IS NULL AND t.start_date IS NULL THEN 4
          WHEN t.status = '완료'
            AND t.completed_at >= p_day_start
            AND t.completed_at < p_next_day_start THEN 5
          ELSE NULL
        END AS class_rank
      FROM public.tasks t
      -- 사전 필터: class_rank 가 non-null 이 될 수 있는 행만 스캔한다 (결과 동일).
      WHERE t.status IN ('대기', '진행중')
        OR (
          t.status = '완료'
          AND t.completed_at >= p_day_start
          AND t.completed_at < p_next_day_start
        )
    ),
    ranked_task_rows AS (
      SELECT
        t.*,
        CASE
          WHEN t.class_rank IN (0, 1, 2) THEN t.due_date::timestamp AT TIME ZONE 'Asia/Seoul'
          WHEN t.class_rank = 3 THEN t.start_date::timestamp AT TIME ZONE 'Asia/Seoul'
          WHEN t.class_rank = 4 THEN t.created_at
          WHEN t.class_rank = 5 THEN t.completed_at
          ELSE NULL
        END AS relevant_at,
        CASE
          WHEN t.status = '진행중' THEN 0
          WHEN t.status = '대기' THEN 1
          ELSE 2
        END AS status_rank
      FROM classified_task_rows t
      WHERE t.class_rank IS NOT NULL
    ),
    task_summary_rows AS (
      SELECT *
      FROM ranked_task_rows t
      ORDER BY
        t.class_rank ASC,
        CASE WHEN t.class_rank = 5 THEN t.relevant_at END DESC NULLS LAST,
        CASE WHEN t.class_rank <> 5 THEN t.relevant_at END ASC NULLS LAST,
        t.status_rank ASC,
        t.position ASC NULLS LAST,
        t.created_at ASC,
        t.id ASC
      LIMIT v_limit
    ),
    dashboard_tasks AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'title', t.title,
            'status', t.status,
            'priority', t.priority,
            'due_date', t.due_date,
            'start_date', t.start_date,
            'position', t.position,
            'parent_id', t.parent_id,
            'project_id', t.project_id,
            'project', (
              SELECT jsonb_build_object('id', pj.id, 'name', pj.name, 'color', pj.color)
              FROM public.projects pj
              WHERE pj.id = t.project_id
            ),
            'created_by', t.created_by,
            'created_at', t.created_at,
            'updated_at', t.updated_at,
            'completed_at', t.completed_at,
            'assignees', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'user_id', ta.user_id,
                  'full_name', assignee.full_name,
                  'avatar_url', assignee.avatar_url
                )
                ORDER BY ta.user_id ASC
              )
              FROM public.task_assignees ta
              JOIN public.profiles assignee
                ON assignee.id = ta.user_id
                AND assignee.is_approved = true
              WHERE ta.task_id = t.id
            ), '[]'::jsonb)
          )
          ORDER BY
            t.class_rank ASC,
            CASE WHEN t.class_rank = 5 THEN t.relevant_at END DESC NULLS LAST,
            CASE WHEN t.class_rank <> 5 THEN t.relevant_at END ASC NULLS LAST,
            t.status_rank ASC,
            t.position ASC NULLS LAST,
            t.created_at ASC,
            t.id ASC
        ),
        '[]'::jsonb
      ) AS value
      FROM task_summary_rows t
    ),
    dashboard_profiles AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'full_name', p.full_name,
            'avatar_url', p.avatar_url,
            'role', p.role
          )
          ORDER BY p.id ASC
        ),
        '[]'::jsonb
      ) AS value
      FROM public.profiles p
      WHERE p.is_approved = true
    )
    SELECT jsonb_build_object(
      'tasks', (SELECT value FROM dashboard_tasks),
      'profiles', (SELECT value FROM dashboard_profiles)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_task_summaries(timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_task_summaries(timestamptz, timestamptz, integer) TO authenticated;
