-- ============================================================
-- 105: 업무지시 미확인 재촉
--   출근했는데도 12시간 넘게 확인하지 않은 지시를
--   평일 오전 11시(KST)에 딱 한 번만 알린다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.remind_pending_work_directives()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      rec.id AS recipient_id,
      rec.user_id,
      d.created_by AS sender_id,
      d.title,
      d.kind,
      COALESCE(p.full_name, '동료') AS recipient_name
    FROM public.work_directive_recipients rec
    JOIN public.work_directives d ON d.id = rec.directive_id
    LEFT JOIN public.profiles p ON p.id = rec.user_id
    WHERE rec.state = '미확인'
      AND rec.created_at < NOW() - INTERVAL '12 hours'
      AND (rec.reminded_on IS NULL OR rec.reminded_on < v_today)
      AND EXISTS (
        SELECT 1 FROM public.attendance_records ar
        WHERE ar.user_id = rec.user_id
          AND ar.work_date = v_today
          AND ar.status <> '미출근'
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      r.user_id,
      'work_directive_reminder',
      CASE WHEN r.kind = '지시' THEN '확인하지 않은 업무지시' ELSE '확인하지 않은 업무 요청' END,
      '"' || r.title || '" 아직 확인하지 않았습니다.',
      '/dashboard'
    );

    IF r.sender_id <> r.user_id THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (
        r.sender_id,
        'work_directive_pending',
        '아직 미확인입니다',
        r.recipient_name || '님이 "' || r.title || '" 을(를) 아직 확인하지 않았습니다.',
        '/dashboard'
      );
    END IF;

    UPDATE public.work_directive_recipients
    SET reminded_on = v_today
    WHERE id = r.recipient_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.remind_pending_work_directives() FROM PUBLIC;

-- 평일 11:00 KST = 02:00 UTC
SELECT cron.schedule(
  'work_directive_reminder',
  '0 2 * * 1-5',
  $$ SELECT public.remind_pending_work_directives(); $$
);
