-- ============================================================
-- 117: 최근 활동 로그 (메인 대시보드 "최근 활동" 카드)
--  - activity_log 테이블 + RLS (읽기 = 승인 사용자 전체, 쓰기 = 트리거만)
--  - tasks / task_assignees / schedules / projects 자동 기록 트리거
--  - 7일 지난 기록 자동 정리 (pg_cron)
--
--  설계 원칙
--   1) DB 에는 "사실"(누가/무엇을/어떤 필드를/무엇에서 무엇으로)만 저장한다.
--      화면 문장은 src/lib/activity/format.ts 에서 조립한다. 문구를 바꿀 때
--      마이그레이션을 새로 만들지 않기 위함이다.
--   2) actor_name, entity_title 은 스냅샷으로 복사 저장한다.
--      - 조회할 때 profiles/tasks 조인을 없애 대시보드 단일 쿼리를 가볍게 유지 (성능 불변조건 3)
--      - 삭제된 항목도 "무엇을 지웠는지" 남아야 하므로 entity_id 에 FK 를 걸지 않는다.
--   3) auth.uid() 가 없는 변경(마이그레이션·배치 등 시스템 작업)은 기록하지 않는다.
--
--  롤백:
--    SELECT cron.unschedule('activity_log_cleanup');
--    DROP TRIGGER tasks_activity_log ON public.tasks;            -- 이하 트리거 4개
--    DROP FUNCTION public.log_task_activity() ...;               -- 이하 함수 5개
--    DROP TABLE public.activity_log;
-- ============================================================

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- 조회 시 profiles 조인을 없애기 위한 스냅샷
  actor_name text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('task', 'schedule', 'project')),
  -- FK 를 걸지 않는다: 원본이 삭제돼도 활동 기록은 남아야 한다.
  entity_id uuid NOT NULL,
  entity_title text NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  field text CHECK (field IN ('status', 'due_date', 'assignee', 'priority', 'title', 'time', 'archive')),
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7일치(수천 줄 규모)를 최신순으로 읽는 것이 유일한 조회 패턴이다.
CREATE INDEX idx_activity_log_created_at ON public.activity_log (created_at DESC);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view activity log"
  ON public.activity_log FOR SELECT TO authenticated
  USING (public.is_approved_user());

-- INSERT/UPDATE/DELETE 정책은 만들지 않는다.
-- 기록은 아래 SECURITY DEFINER 트리거로만 남고, 앱에서 위조하거나 지울 수 없다.

-- ---------- 공통 기록 헬퍼 ----------
CREATE OR REPLACE FUNCTION public.write_activity_log(
  p_entity_type text,
  p_entity_id uuid,
  p_entity_title text,
  p_action text,
  p_field text,
  p_old_value text,
  p_new_value text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
BEGIN
  -- 시스템 작업(마이그레이션·배치·cron)은 기록하지 않는다. 로그가 사람 활동만 담도록.
  IF v_actor IS NULL THEN
    RETURN;
  END IF;

  SELECT full_name INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  IF v_actor_name IS NULL OR btrim(v_actor_name) = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.activity_log (
    actor_id, actor_name, entity_type, entity_id, entity_title,
    action, field, old_value, new_value
  ) VALUES (
    v_actor,
    v_actor_name,
    p_entity_type,
    p_entity_id,
    COALESCE(NULLIF(btrim(p_entity_title), ''), '(제목 없음)'),
    p_action,
    p_field,
    p_old_value,
    p_new_value
  );
END;
$$;

REVOKE ALL ON FUNCTION public.write_activity_log(text, uuid, text, text, text, text, text) FROM PUBLIC;

-- ---------- 할일 ----------
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_activity_log('task', NEW.id, NEW.title, 'create', NULL, NULL, NULL);
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.write_activity_log('task', OLD.id, OLD.title, 'delete', NULL, NULL, NULL);
    RETURN NULL;
  END IF;

  -- UPDATE: 실제로 바뀐 필드마다 한 줄씩 남긴다(마감+담당자 동시 변경 = 2줄).
  -- 화면에서 같은 사람·같은 대상·5분 이내 기록을 한 줄로 묶어 보여준다.
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    PERFORM public.write_activity_log('task', NEW.id, NEW.title, 'update', 'title', OLD.title, NEW.title);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_activity_log('task', NEW.id, NEW.title, 'update', 'status', OLD.status, NEW.status);
  END IF;

  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    PERFORM public.write_activity_log(
      'task', NEW.id, NEW.title, 'update', 'due_date',
      to_char(OLD.due_date, 'YYYY-MM-DD'),
      to_char(NEW.due_date, 'YYYY-MM-DD')
    );
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    PERFORM public.write_activity_log('task', NEW.id, NEW.title, 'update', 'priority', OLD.priority, NEW.priority);
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER tasks_activity_log
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();

-- ---------- 할일 담당자 ----------
CREATE OR REPLACE FUNCTION public.log_task_assignee_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_task_title text;
  v_task_created_at timestamptz;
  v_member_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT title, created_at INTO v_task_title, v_task_created_at
    FROM public.tasks WHERE id = NEW.task_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    -- 할일 생성 직후의 담당자 지정은 '등록' 기록과 중복이라 남기지 않는다.
    -- (안 하면 할일 하나 만들 때마다 "등록"+"담당자 지정"이 쌍으로 떠서 목록이 시끄러워진다)
    IF v_task_created_at > now() - interval '10 seconds' THEN
      RETURN NULL;
    END IF;

    SELECT full_name INTO v_member_name FROM public.profiles WHERE id = NEW.user_id;
    PERFORM public.write_activity_log('task', NEW.task_id, v_task_title, 'update', 'assignee', NULL, v_member_name);
    RETURN NULL;
  END IF;

  -- DELETE: 할일 자체가 삭제되어 연쇄로 지워진 경우는 '삭제' 기록만 남기면 되므로 건너뛴다.
  SELECT title INTO v_task_title FROM public.tasks WHERE id = OLD.task_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT full_name INTO v_member_name FROM public.profiles WHERE id = OLD.user_id;
  PERFORM public.write_activity_log('task', OLD.task_id, v_task_title, 'update', 'assignee', v_member_name, NULL);
  RETURN NULL;
END;
$$;

CREATE TRIGGER task_assignees_activity_log
  AFTER INSERT OR DELETE ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.log_task_assignee_activity();

-- ---------- 일정 ----------
-- 개인 일정(visibility = 'private')은 기록하지 않는다.
-- 활동 로그는 승인 사용자 전체에게 공개되므로, 여기에 개인 일정 제목을 남기면
-- 기존 일정 공개 규칙(011/034)을 우회해 제목이 새어나간다.
CREATE OR REPLACE FUNCTION public.log_schedule_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.visibility <> 'company' THEN
      RETURN NULL;
    END IF;
    PERFORM public.write_activity_log('schedule', NEW.id, NEW.title, 'create', NULL, NULL, NULL);
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.visibility <> 'company' THEN
      RETURN NULL;
    END IF;
    PERFORM public.write_activity_log('schedule', OLD.id, OLD.title, 'delete', NULL, NULL, NULL);
    RETURN NULL;
  END IF;

  IF NEW.visibility <> 'company' THEN
    RETURN NULL;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title THEN
    PERFORM public.write_activity_log('schedule', NEW.id, NEW.title, 'update', 'title', OLD.title, NEW.title);
  END IF;

  IF NEW.start_time IS DISTINCT FROM OLD.start_time THEN
    PERFORM public.write_activity_log(
      'schedule', NEW.id, NEW.title, 'update', 'time',
      to_char(OLD.start_time AT TIME ZONE 'Asia/Seoul', 'MM/DD HH24:MI'),
      to_char(NEW.start_time AT TIME ZONE 'Asia/Seoul', 'MM/DD HH24:MI')
    );
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER schedules_activity_log
  AFTER INSERT OR UPDATE OR DELETE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.log_schedule_activity();

-- ---------- 프로젝트 ----------
CREATE OR REPLACE FUNCTION public.log_project_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_activity_log('project', NEW.id, NEW.name, 'create', NULL, NULL, NULL);
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.write_activity_log('project', OLD.id, OLD.name, 'delete', NULL, NULL, NULL);
    RETURN NULL;
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM public.write_activity_log('project', NEW.id, NEW.name, 'update', 'title', OLD.name, NEW.name);
  END IF;

  IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
    PERFORM public.write_activity_log(
      'project', NEW.id, NEW.name, 'update', 'archive',
      OLD.is_archived::text, NEW.is_archived::text
    );
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER projects_activity_log
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_project_activity();

-- ---------- 7일 보존 ----------
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 04:00 KST = 19:00 UTC (전날)
SELECT cron.schedule(
  'activity_log_cleanup',
  '0 19 * * *',
  $$ DELETE FROM public.activity_log WHERE created_at < now() - interval '7 days'; $$
);
