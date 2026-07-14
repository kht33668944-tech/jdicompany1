-- Run after a local migration reset with: supabase test db
-- Fixtures are transaction-scoped; summary RPC calls below perform no DML.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(11);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '87000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'dashboard-reader@example.test', '', '2026-07-01T00:00:00Z', '{}'::jsonb, '{"full_name":"Dashboard Reader"}'::jsonb, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000000', '87000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'dashboard-alpha@example.test', '', '2026-07-01T00:00:00Z', '{}'::jsonb, '{"full_name":"Alpha"}'::jsonb, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000000', '87000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'dashboard-unapproved@example.test', '', '2026-07-01T00:00:00Z', '{}'::jsonb, '{"full_name":"Unapproved"}'::jsonb, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000000', '87000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dashboard-denied@example.test', '', '2026-07-01T00:00:00Z', '{}'::jsonb, '{"full_name":"Denied"}'::jsonb, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000000', '87000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'dashboard-bravo@example.test', '', '2026-07-01T00:00:00Z', '{}'::jsonb, '{"full_name":"Bravo"}'::jsonb, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z');

UPDATE public.profiles
SET is_approved = id NOT IN (
      '87000000-0000-0000-0000-000000000003',
      '87000000-0000-0000-0000-000000000004'
    ),
    full_name = CASE id
      WHEN '87000000-0000-0000-0000-000000000001' THEN 'Dashboard Reader'
      WHEN '87000000-0000-0000-0000-000000000002' THEN 'Alpha'
      WHEN '87000000-0000-0000-0000-000000000003' THEN 'Unapproved'
      WHEN '87000000-0000-0000-0000-000000000004' THEN 'Denied'
      WHEN '87000000-0000-0000-0000-000000000005' THEN 'Bravo'
    END,
    avatar_url = CASE id
      WHEN '87000000-0000-0000-0000-000000000002' THEN 'https://example.test/alpha.png'
      ELSE NULL
    END,
    role = CASE id
      WHEN '87000000-0000-0000-0000-000000000002' THEN 'developer'
      ELSE 'employee'
    END
WHERE id BETWEEN '87000000-0000-0000-0000-000000000001'
             AND '87000000-0000-0000-0000-000000000005';

INSERT INTO public.tasks (
  id, title, status, priority, due_date, start_date, position,
  parent_id, created_by, created_at, updated_at
)
VALUES
  ('87000000-0000-0000-0000-000000000101', 'overdue', '대기', '보통', '2026-07-12', '2026-07-01', 4, NULL, '87000000-0000-0000-0000-000000000001', '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'),
  ('87000000-0000-0000-0000-000000000102', 'due today', '진행중', '높음', '2026-07-13', '2026-07-01', 3, NULL, '87000000-0000-0000-0000-000000000001', '2026-07-02T00:00:00Z', '2026-07-02T00:00:00Z'),
  ('87000000-0000-0000-0000-000000000103', 'started today child', '대기', '보통', NULL, '2026-07-13', 2, '87000000-0000-0000-0000-000000000102', '87000000-0000-0000-0000-000000000001', '2026-07-03T00:00:00Z', '2026-07-03T00:00:00Z'),
  ('87000000-0000-0000-0000-000000000104', 'undated', '진행중', '낮음', NULL, NULL, 1, NULL, '87000000-0000-0000-0000-000000000001', '2026-07-04T00:00:00Z', '2026-07-04T00:00:00Z'),
  ('87000000-0000-0000-0000-000000000105', 'completed at KST start', '완료', '보통', NULL, NULL, 1, NULL, '87000000-0000-0000-0000-000000000001', '2026-07-05T00:00:00Z', '2026-07-05T00:00:00Z'),
  ('87000000-0000-0000-0000-000000000106', 'future only', '대기', '보통', '2026-07-14', '2026-07-14', 1, NULL, '87000000-0000-0000-0000-000000000001', '2026-07-06T00:00:00Z', '2026-07-06T00:00:00Z'),
  ('87000000-0000-0000-0000-000000000107', 'completed at next KST start', '완료', '보통', NULL, NULL, 1, NULL, '87000000-0000-0000-0000-000000000001', '2026-07-07T00:00:00Z', '2026-07-07T00:00:00Z'),
  ('87000000-0000-0000-0000-000000000108', 'created at newer sub-millisecond', '대기', '보통', NULL, NULL, 9, NULL, '87000000-0000-0000-0000-000000000001', '2026-07-05T00:00:00.000002Z', '2026-07-05T00:00:00.000002Z'),
  ('87000000-0000-0000-0000-000000000109', 'created at older sub-millisecond', '대기', '보통', NULL, NULL, 9, NULL, '87000000-0000-0000-0000-000000000001', '2026-07-05T00:00:00.000001Z', '2026-07-05T00:00:00.000001Z'),
  ('87000000-0000-0000-0000-000000000110', 'completed at older sub-millisecond', '완료', '보통', NULL, NULL, 9, NULL, '87000000-0000-0000-0000-000000000001', '2026-07-08T00:00:00Z', '2026-07-08T00:00:00Z'),
  ('87000000-0000-0000-0000-000000000111', 'completed at newer sub-millisecond', '완료', '보통', NULL, NULL, 9, NULL, '87000000-0000-0000-0000-000000000001', '2026-07-08T00:00:00Z', '2026-07-08T00:00:00Z');

UPDATE public.tasks
SET completed_at = CASE id
  WHEN '87000000-0000-0000-0000-000000000105' THEN '2026-07-12T15:00:00Z'::timestamptz
  WHEN '87000000-0000-0000-0000-000000000107' THEN '2026-07-13T15:00:00Z'::timestamptz
  WHEN '87000000-0000-0000-0000-000000000110' THEN '2026-07-13T12:00:00.000001Z'::timestamptz
  WHEN '87000000-0000-0000-0000-000000000111' THEN '2026-07-13T12:00:00.000002Z'::timestamptz
END
WHERE id IN (
  '87000000-0000-0000-0000-000000000105',
  '87000000-0000-0000-0000-000000000107',
  '87000000-0000-0000-0000-000000000110',
  '87000000-0000-0000-0000-000000000111'
);

INSERT INTO public.task_assignees (task_id, user_id)
VALUES
  ('87000000-0000-0000-0000-000000000102', '87000000-0000-0000-0000-000000000005'),
  ('87000000-0000-0000-0000-000000000102', '87000000-0000-0000-0000-000000000003'),
  ('87000000-0000-0000-0000-000000000102', '87000000-0000-0000-0000-000000000002'),
  ('87000000-0000-0000-0000-000000000103', '87000000-0000-0000-0000-000000000003');

INSERT INTO public.tasks (
  id, title, status, priority, due_date, position, created_by, created_at, updated_at
)
SELECT
  ('87100000-0000-0000-0000-' || lpad(series::text, 12, '0'))::uuid,
  'cap fixture ' || series,
  '대기',
  '보통',
  '2026-07-14'::date,
  series,
  '87000000-0000-0000-0000-000000000001'::uuid,
  '2026-07-01T00:00:00Z'::timestamptz,
  '2026-07-01T00:00:00Z'::timestamptz
FROM generate_series(1, 101) AS series;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '87000000-0000-0000-0000-000000000004', true);

SELECT extensions.throws_ok(
  $$SELECT public.get_dashboard_task_summaries(
    '2026-07-12T15:00:00Z'::timestamptz,
    '2026-07-13T15:00:00Z'::timestamptz,
    101
  )$$,
  '42501',
  'DASHBOARD_REQUESTER_NOT_APPROVED',
  'unapproved requester is denied by the read-only summary RPC'
);

SELECT set_config('request.jwt.claim.sub', '87000000-0000-0000-0000-000000000001', true);

SELECT extensions.lives_ok(
  $$SELECT public.get_dashboard_task_summaries(
    '2026-07-12T15:00:00Z'::timestamptz,
    '2026-07-13T15:00:00Z'::timestamptz,
    101
  )$$,
  'approved requester can read the atomic task summary snapshot'
);

SELECT extensions.is(
  (
    WITH snapshot AS (
      SELECT public.get_dashboard_task_summaries(
        '2026-07-12T15:00:00Z'::timestamptz,
        '2026-07-13T15:00:00Z'::timestamptz,
        101
      ) AS value
    )
    SELECT array_agg((task.value ->> 'id')::uuid ORDER BY task.ordinality)
    FROM snapshot
    CROSS JOIN LATERAL jsonb_array_elements(snapshot.value -> 'tasks')
      WITH ORDINALITY AS task(value, ordinality)
  ),
  ARRAY[
    '87000000-0000-0000-0000-000000000101'::uuid,
    '87000000-0000-0000-0000-000000000102'::uuid,
    '87000000-0000-0000-0000-000000000103'::uuid,
    '87000000-0000-0000-0000-000000000104'::uuid,
    '87000000-0000-0000-0000-000000000109'::uuid,
    '87000000-0000-0000-0000-000000000108'::uuid,
    '87000000-0000-0000-0000-000000000111'::uuid,
    '87000000-0000-0000-0000-000000000110'::uuid,
    '87000000-0000-0000-0000-000000000105'::uuid
  ],
  'KST classes retain precedence and sub-millisecond created and completed timestamps retain exact SQL order'
);

SELECT extensions.is(
  (
    WITH snapshot AS (
      SELECT public.get_dashboard_task_summaries(
        '2026-07-12T15:00:00Z'::timestamptz,
        '2026-07-13T15:00:00Z'::timestamptz,
        101
      ) AS value
    )
    SELECT (task.value ->> 'parent_id')::uuid
    FROM snapshot
    CROSS JOIN LATERAL jsonb_array_elements(snapshot.value -> 'tasks') AS task(value)
    WHERE task.value ->> 'id' = '87000000-0000-0000-0000-000000000103'
  ),
  '87000000-0000-0000-0000-000000000102'::uuid,
  'an atomic task snapshot keeps independently eligible subtasks and parent metadata'
);

SELECT extensions.is(
  (
    WITH snapshot AS (
      SELECT public.get_dashboard_task_summaries(
        '2026-07-12T15:00:00Z'::timestamptz,
        '2026-07-13T15:00:00Z'::timestamptz,
        101
      ) AS value
    )
    SELECT task.value -> 'assignees'
    FROM snapshot
    CROSS JOIN LATERAL jsonb_array_elements(snapshot.value -> 'tasks') AS task(value)
    WHERE task.value ->> 'id' = '87000000-0000-0000-0000-000000000102'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'user_id', '87000000-0000-0000-0000-000000000002',
      'full_name', 'Alpha',
      'avatar_url', 'https://example.test/alpha.png'
    ),
    jsonb_build_object(
      'user_id', '87000000-0000-0000-0000-000000000005',
      'full_name', 'Bravo',
      'avatar_url', NULL
    )
  ),
  'atomic task snapshots retain only approved assignees ordered by user_id'
);

SELECT extensions.is(
  (
    WITH snapshot AS (
      SELECT public.get_dashboard_task_summaries(
        '2026-07-12T15:00:00Z'::timestamptz,
        '2026-07-13T15:00:00Z'::timestamptz,
        101
      ) AS value
    )
    SELECT task.value -> 'assignees'
    FROM snapshot
    CROSS JOIN LATERAL jsonb_array_elements(snapshot.value -> 'tasks') AS task(value)
    WHERE task.value ->> 'id' = '87000000-0000-0000-0000-000000000103'
  ),
  '[]'::jsonb,
  'a task assigned only to an unapproved profile has no visible assignee'
);

SELECT extensions.is(
  (
    SELECT jsonb_array_length(public.get_dashboard_task_summaries(
      '2026-07-13T15:00:00Z'::timestamptz,
      '2026-07-14T15:00:00Z'::timestamptz,
      100
    ) -> 'tasks')
  ),
  100,
  'the atomic RPC snapshot returns exactly 100 tasks when the caller requests 100'
);

SELECT extensions.is(
  (
    SELECT jsonb_array_length(public.get_dashboard_task_summaries(
      '2026-07-13T15:00:00Z'::timestamptz,
      '2026-07-14T15:00:00Z'::timestamptz,
      101
    ) -> 'tasks')
  ),
  101,
  'the 101st task is available as the truncation witness in the atomic snapshot'
);

SELECT extensions.is(
  (
    SELECT jsonb_array_length(public.get_dashboard_task_summaries(
      '2026-07-13T15:00:00Z'::timestamptz,
      '2026-07-14T15:00:00Z'::timestamptz,
      999
    ) -> 'tasks')
  ),
  101,
  'the atomic RPC snapshot clamps an oversized request to 101 tasks'
);

SELECT extensions.is(
  (
    SELECT count(*)
    FROM public.tasks
    WHERE id::text LIKE '87000000-0000-0000-0000-%'
       OR id::text LIKE '87100000-0000-0000-0000-%'
  ),
  112::bigint,
  'summary snapshots and cap checks leave deterministic fixture rows unchanged'
);

UPDATE public.tasks
SET status = '완료',
    completed_at = NULL
WHERE id::text LIKE '87000000-0000-0000-0000-%'
   OR id::text LIKE '87100000-0000-0000-0000-%';

SELECT extensions.is(
  (
    SELECT public.get_dashboard_task_summaries(
      '2026-07-12T15:00:00Z'::timestamptz,
      '2026-07-13T15:00:00Z'::timestamptz,
      101
    )
  ),
  jsonb_build_object(
    'tasks', '[]'::jsonb,
    'profiles', jsonb_build_array(
      jsonb_build_object(
        'id', '87000000-0000-0000-0000-000000000001',
        'full_name', 'Dashboard Reader',
        'avatar_url', NULL,
        'role', 'employee'
      ),
      jsonb_build_object(
        'id', '87000000-0000-0000-0000-000000000002',
        'full_name', 'Alpha',
        'avatar_url', 'https://example.test/alpha.png',
        'role', 'developer'
      ),
      jsonb_build_object(
        'id', '87000000-0000-0000-0000-000000000005',
        'full_name', 'Bravo',
        'avatar_url', NULL,
        'role', 'employee'
      )
    )
  ),
  'an empty atomic task snapshot retains the complete approved minimal profile list'
);

SELECT * FROM extensions.finish();

ROLLBACK;
