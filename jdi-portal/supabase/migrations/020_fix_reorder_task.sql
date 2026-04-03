-- reorder_task RPC: 삭제된 assigned_to 컬럼 → task_assignees 테이블 참조로 수정
-- 원인: 016_tasks_redesign에서 assigned_to 컬럼 삭제했으나 이 함수는 미수정

CREATE OR REPLACE FUNCTION public.reorder_task(
  p_task_id UUID,
  p_new_status TEXT,
  p_new_position INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_user_role TEXT;
  v_target_count INTEGER;
  v_new_position INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT *
  INTO v_task
  FROM public.tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  SELECT role
  INTO v_user_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT (
    v_task.created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.task_assignees
      WHERE task_id = p_task_id AND user_id = auth.uid()
    ) OR
    v_user_role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*)
  INTO v_target_count
  FROM public.tasks
  WHERE status = p_new_status AND id <> p_task_id;

  v_new_position := GREATEST(0, LEAST(p_new_position, v_target_count));

  IF v_task.status = p_new_status THEN
    IF v_new_position > v_task.position THEN
      UPDATE public.tasks
      SET
        position = position - 1,
        updated_at = NOW()
      WHERE
        status = v_task.status
        AND id <> p_task_id
        AND position > v_task.position
        AND position <= v_new_position;
    ELSIF v_new_position < v_task.position THEN
      UPDATE public.tasks
      SET
        position = position + 1,
        updated_at = NOW()
      WHERE
        status = v_task.status
        AND id <> p_task_id
        AND position >= v_new_position
        AND position < v_task.position;
    ELSE
      RETURN;
    END IF;
  ELSE
    UPDATE public.tasks
    SET
      position = position - 1,
      updated_at = NOW()
    WHERE
      status = v_task.status
      AND position > v_task.position;

    UPDATE public.tasks
    SET
      position = position + 1,
      updated_at = NOW()
    WHERE
      status = p_new_status
      AND position >= v_new_position;
  END IF;

  UPDATE public.tasks
  SET
    status = p_new_status,
    position = v_new_position,
    updated_at = NOW()
  WHERE id = p_task_id;
END;
$$;
