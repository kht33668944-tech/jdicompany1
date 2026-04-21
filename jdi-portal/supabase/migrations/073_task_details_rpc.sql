-- 할일 상세 패널 속도 개선: 체크리스트 + 활동을 한 번의 RPC 로 반환
-- (기존: 2회 왕복 → 1회 왕복)
-- 활동은 프로필 조인 포함

CREATE OR REPLACE FUNCTION public.get_task_details(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checklist jsonb;
  v_activities jsonb;
BEGIN
  IF NOT public.is_approved_user() THEN
    RETURN jsonb_build_object(
      'checklist', '[]'::jsonb,
      'activities', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(ci) ORDER BY ci.position ASC), '[]'::jsonb)
  INTO v_checklist
  FROM public.task_checklist_items ci
  WHERE ci.task_id = p_task_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'task_id', a.task_id,
        'user_id', a.user_id,
        'type', a.type,
        'content', a.content,
        'metadata', a.metadata,
        'created_at', a.created_at,
        'user_profile', jsonb_build_object(
          'full_name', p.full_name,
          'avatar_url', p.avatar_url
        )
      )
      ORDER BY a.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_activities
  FROM public.task_activities a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.task_id = p_task_id;

  RETURN jsonb_build_object(
    'checklist', v_checklist,
    'activities', v_activities
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_task_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_task_details(uuid) TO authenticated;
