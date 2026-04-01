CREATE POLICY "Users can delete own pending requests"
ON public.vacation_requests
FOR DELETE
TO authenticated
USING (user_id = auth.uid() AND status = '?湲곗쨷');

CREATE OR REPLACE FUNCTION public.approve_vacation_request(
  p_request_id UUID,
  p_admin_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.vacation_requests%ROWTYPE;
  v_hire_date DATE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_admin_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT *
  INTO v_request
  FROM public.vacation_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacation request not found';
  END IF;

  IF v_request.status <> '?湲곗쨷' THEN
    RAISE EXCEPTION 'Vacation request already reviewed';
  END IF;

  SELECT hire_date
  INTO v_hire_date
  FROM public.profiles
  WHERE id = v_request.user_id;

  UPDATE public.vacation_requests
  SET
    status = '?뱀씤',
    reviewed_by = p_admin_id,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_request_id;

  INSERT INTO public.vacation_balances (
    user_id,
    year,
    total_days,
    used_days
  )
  VALUES (
    v_request.user_id,
    EXTRACT(YEAR FROM v_request.start_date)::INTEGER,
    public.calculate_vacation_days(v_hire_date, EXTRACT(YEAR FROM v_request.start_date)::INTEGER),
    v_request.days_count
  )
  ON CONFLICT (user_id, year)
  DO UPDATE SET
    used_days = public.vacation_balances.used_days + EXCLUDED.used_days,
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_vacation_request(UUID, UUID) TO authenticated;

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
    v_task.assigned_to = auth.uid() OR
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

GRANT EXECUTE ON FUNCTION public.reorder_task(UUID, TEXT, INTEGER) TO authenticated;
