-- Run after a local migration reset with: supabase test db
-- All fixtures and mutations are rolled back.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(55);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'timeline-owner@example.test', '', now(), '{}'::jsonb, '{"full_name":"타임라인 작성자"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'timeline-other@example.test', '', now(), '{}'::jsonb, '{"full_name":"다른 직원"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'timeline-admin@example.test', '', now(), '{}'::jsonb, '{"full_name":"관리자"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'timeline-unapproved@example.test', '', now(), '{}'::jsonb, '{"full_name":"미승인 직원"}'::jsonb, now(), now());

UPDATE public.profiles
SET is_approved = id <> '10000000-0000-0000-0000-000000000004',
    role = CASE WHEN id = '10000000-0000-0000-0000-000000000003' THEN 'admin' ELSE 'employee' END
WHERE id IN (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004'
);

INSERT INTO public.tasks (id, title, status, created_by)
VALUES
  (
    '40000000-0000-0000-0000-000000000001',
    '타임라인 공유 대상 업무',
    '완료',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '미완료 업무',
    '진행중',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '권한 없는 완료 업무',
    '완료',
    '10000000-0000-0000-0000-000000000002'
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    '담당자로 배정된 완료 업무',
    '완료',
    '10000000-0000-0000-0000-000000000002'
  ),
  (
    '40000000-0000-0000-0000-000000000005',
    '삭제 정리 확인 업무',
    '완료',
    '10000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.task_assignees (task_id, user_id)
VALUES (
  '40000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001'
);

CREATE TEMP TABLE task_completion_snapshot AS
SELECT completed_at
FROM public.tasks
WHERE id = '40000000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

SELECT extensions.lives_ok(
  $$INSERT INTO public.work_timeline_entries (id, user_id, task_id, title)
    VALUES (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '완료 업무'
    )$$,
  'approved owner can create an entry'
);

SELECT extensions.isnt(
  (SELECT completed_at FROM public.tasks WHERE id = '40000000-0000-0000-0000-000000000001'),
  NULL::timestamptz,
  'a completed task records its dedicated completion timestamp'
);

SELECT extensions.lives_ok(
  $$UPDATE public.tasks SET title = '완료 후 제목 수정'
    WHERE id = '40000000-0000-0000-0000-000000000001'$$,
  'an unrelated task edit succeeds after completion'
);

SELECT extensions.is(
  (SELECT completed_at FROM public.tasks WHERE id = '40000000-0000-0000-0000-000000000001'),
  (SELECT completed_at FROM task_completion_snapshot),
  'an unrelated task edit does not change its completion timestamp'
);

SELECT extensions.throws_ok(
  $$INSERT INTO public.work_timeline_entries (user_id, task_id, title)
    VALUES (
      '10000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      '미완료 업무 직접 공유'
    )$$,
  '42501',
  NULL,
  'direct client cannot share an incomplete task'
);

SELECT extensions.throws_ok(
  $$INSERT INTO public.work_timeline_entries (user_id, task_id, title)
    VALUES (
      '10000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000003',
      '권한 없는 업무 직접 공유'
    )$$,
  '42501',
  NULL,
  'direct client cannot share a completed task without creator or assignee access'
);

SELECT extensions.lives_ok(
  $$INSERT INTO public.work_timeline_entries (id, user_id, task_id, title)
    VALUES (
      '20000000-0000-0000-0000-000000000004',
      '10000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000004',
      '담당 업무 직접 공유'
    )$$,
  'direct client can share an assigned completed task'
);

SELECT extensions.throws_ok(
  $$UPDATE public.work_timeline_entries
    SET task_id = '40000000-0000-0000-0000-000000000004'
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '23514',
  NULL,
  'direct client cannot relink an entry even to another authorized completed task'
);

RESET ROLE;
DELETE FROM public.task_assignees
WHERE task_id = '40000000-0000-0000-0000-000000000004'
  AND user_id = '10000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

SELECT extensions.lives_ok(
  $$UPDATE public.work_timeline_entries
    SET title = '담당 해제 후에도 수정 가능한 공유'
    WHERE id = '20000000-0000-0000-0000-000000000004'$$,
  'an entry remains editable after its task assignment is removed'
);

SELECT extensions.is(
  (WITH deleted AS (
    DELETE FROM public.work_timeline_entries
    WHERE id = '20000000-0000-0000-0000-000000000004' RETURNING 1
  ) SELECT count(*) FROM deleted), 1::bigint,
  'owner can remove the assigned-task regression fixture'
);

SELECT extensions.throws_ok(
  $$UPDATE public.work_timeline_entries
    SET task_id = '40000000-0000-0000-0000-000000000002'
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '23514',
  NULL,
  'direct client cannot relink an entry to an incomplete task'
);

SELECT extensions.throws_ok(
  $$UPDATE public.work_timeline_entries
    SET task_id = '40000000-0000-0000-0000-000000000003'
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '23514',
  NULL,
  'direct client cannot relink an entry to an unauthorized completed task'
);

SELECT extensions.is(
  (SELECT task_id FROM public.work_timeline_entries
    WHERE id = '20000000-0000-0000-0000-000000000001'),
  '40000000-0000-0000-0000-000000000001'::uuid,
  'rejected relinks preserve the original authorized task'
);

SELECT extensions.lives_ok(
  $$INSERT INTO public.work_timeline_entries (id, user_id, task_id, title)
    VALUES (
      '20000000-0000-0000-0000-000000000005',
      '10000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000005',
      '업무 삭제 정리 확인'
    )$$,
  'owner can create a task-linked entry for delete cleanup testing'
);

SELECT extensions.lives_ok(
  $$DELETE FROM public.tasks
    WHERE id = '40000000-0000-0000-0000-000000000005'$$,
  'task deletion preserves the foreign key ON DELETE SET NULL behavior'
);

SELECT extensions.is(
  (SELECT task_id FROM public.work_timeline_entries
    WHERE id = '20000000-0000-0000-0000-000000000005'),
  NULL::uuid,
  'task deletion clears the immutable link through the foreign key action'
);

SELECT extensions.is(
  (WITH deleted AS (
    DELETE FROM public.work_timeline_entries
    WHERE id = '20000000-0000-0000-0000-000000000005' RETURNING 1
  ) SELECT count(*) FROM deleted), 1::bigint,
  'owner can remove the task-delete regression fixture'
);

SELECT extensions.throws_ok(
  $$INSERT INTO public.work_timeline_entries (user_id, title)
    VALUES ('10000000-0000-0000-0000-000000000002', '타인 명의 업무')$$,
  '42501',
  NULL,
  'owner cannot create an entry for another user'
);

SELECT extensions.throws_ok(
  $$INSERT INTO public.work_timeline_entries (user_id, title)
    VALUES ('10000000-0000-0000-0000-000000000001', '   ')$$,
  '23514',
  NULL,
  'blank titles are rejected'
);

SELECT extensions.throws_ok(
  $$INSERT INTO public.work_timeline_entries (user_id, task_id, title)
    VALUES (
      '10000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '중복 공유 업무'
    )$$,
  '23505',
  NULL,
  'the same employee cannot share one task twice'
);

SELECT extensions.lives_ok(
  $$INSERT INTO public.work_timeline_attachments (
      id, entry_id, file_name, file_path, thumbnail_path, mime_type, file_size, position
    ) VALUES (
      '30000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      'result.png',
      '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/original.png',
      '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/thumbnail.webp',
      'image/png', 1024, 0
    )$$,
  'owner can create attachment metadata with the canonical path'
);

SELECT extensions.throws_ok(
  $$INSERT INTO public.work_timeline_attachments (
      entry_id, file_name, file_path, mime_type, file_size, position
    ) VALUES (
      '20000000-0000-0000-0000-000000000001',
      'duplicate-position.png',
      '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/duplicate-position.png',
      'image/png', 1024, 0
    )$$,
  '23505',
  NULL,
  'one entry cannot use the same attachment position twice'
);

SELECT extensions.throws_ok(
  $$INSERT INTO public.work_timeline_attachments (
      entry_id, file_name, file_path, mime_type, file_size, position
    ) VALUES (
      '20000000-0000-0000-0000-000000000001', 'wrong.png',
      '10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000001/wrong.png',
      'image/png', 1024, 1
    )$$,
  '42501',
  NULL,
  'attachment metadata with a mismatched owner path is rejected'
);

SELECT extensions.lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name)
    VALUES ('work-timeline', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/original.png')$$,
  'owner can upload to the canonical storage path'
);

SELECT extensions.lives_ok(
  $$INSERT INTO public.work_timeline_storage_cleanup_queue (owner_id, path)
    VALUES (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/orphan.png'
    )$$,
  'owner can queue an own canonical storage path for cleanup'
);

SELECT extensions.throws_ok(
  $$INSERT INTO public.work_timeline_storage_cleanup_queue (owner_id, path)
    VALUES (
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000001/other.png'
    )$$,
  '42501',
  NULL,
  'owner cannot queue another employee storage path'
);

SELECT extensions.throws_ok(
  $$INSERT INTO public.work_timeline_storage_cleanup_queue (owner_id, path)
    VALUES (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001/missing-file-name'
    )$$,
  '23514',
  NULL,
  'cleanup queue rejects a non-canonical storage path'
);

SELECT extensions.throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name)
    VALUES ('work-timeline', '10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000001/wrong-owner.png')$$,
  '42501',
  NULL,
  'storage upload with a mismatched user folder is rejected'
);

SELECT extensions.throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name)
    VALUES ('work-timeline', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000099/wrong-entry.png')$$,
  '42501',
  NULL,
  'storage upload for an unknown entry folder is rejected'
);

SELECT extensions.lives_ok(
  $$UPDATE public.tasks SET status = '진행중'
    WHERE id = '40000000-0000-0000-0000-000000000001'$$,
  'task creator can move the shared task back to in progress'
);

SELECT extensions.is(
  (SELECT completed_at FROM public.tasks WHERE id = '40000000-0000-0000-0000-000000000001'),
  NULL::timestamptz,
  'moving a task out of completed clears its completion timestamp'
);

SELECT extensions.lives_ok(
  $$UPDATE public.work_timeline_entries SET title = '작성자가 수정한 업무'
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  'owner can update an entry after its linked task is no longer completed'
);

SELECT extensions.throws_ok(
  $$UPDATE public.work_timeline_entries
    SET user_id = '10000000-0000-0000-0000-000000000002'
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '23514',
  NULL,
  'owner cannot transfer an entry to another employee'
);

SELECT extensions.lives_ok(
  $$INSERT INTO public.work_timeline_attachments (
      id, entry_id, file_name, file_path, mime_type, file_size, position
    ) VALUES (
      '30000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      'second.png',
      '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/second.png',
      'image/png', 1024, 1
    )$$,
  'owner can create a second attachment position'
);

SELECT extensions.is(
  (WITH deleted AS (
    DELETE FROM public.work_timeline_attachments
    WHERE id = '30000000-0000-0000-0000-000000000002' RETURNING 1
  ) SELECT count(*) FROM deleted), 1::bigint,
  'owner can delete own attachment metadata'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

SELECT extensions.is(
  (SELECT count(*) FROM public.work_timeline_storage_cleanup_queue), 0::bigint,
  'another employee cannot view an owner cleanup queue row'
);

SELECT extensions.lives_ok(
  $$INSERT INTO public.work_timeline_storage_cleanup_queue (owner_id, path)
    VALUES (
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000002/orphan.png'
    )$$,
  'another employee can queue an own storage path'
);

SELECT extensions.is(
  (SELECT count(*) FROM public.work_timeline_entries), 1::bigint,
  'another approved employee can read entries'
);

SELECT extensions.is(
  (WITH changed AS (
    UPDATE public.work_timeline_entries SET title = '타인이 수정한 업무'
    WHERE id = '20000000-0000-0000-0000-000000000001' RETURNING 1
  ) SELECT count(*) FROM changed), 0::bigint,
  'another employee cannot update an entry'
);

SELECT extensions.is(
  (WITH deleted AS (
    DELETE FROM public.work_timeline_attachments
    WHERE id = '30000000-0000-0000-0000-000000000001' RETURNING 1
  ) SELECT count(*) FROM deleted), 0::bigint,
  'another employee cannot delete attachment metadata'
);

SELECT extensions.is(
  (WITH deleted AS (
    DELETE FROM storage.objects WHERE bucket_id = 'work-timeline'
      AND name = '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/original.png'
    RETURNING 1
  ) SELECT count(*) FROM deleted), 0::bigint,
  'another employee cannot delete an owner storage object'
);

SELECT extensions.lives_ok(
  $$INSERT INTO public.work_timeline_entries (id, user_id, title)
    VALUES (
      '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000002',
      '관리자 삭제 확인용 업무'
    )$$,
  'another approved employee can create an own entry'
);

SELECT extensions.lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name)
    VALUES (
      'work-timeline',
      '10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000002/admin-cleanup.png'
    )$$,
  'another approved employee can upload to an own entry path'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);

SELECT extensions.is(
  (SELECT count(*) FROM public.work_timeline_storage_cleanup_queue), 0::bigint,
  'an unapproved employee cannot view cleanup queue rows'
);

SELECT extensions.throws_ok(
  $$INSERT INTO public.work_timeline_storage_cleanup_queue (owner_id, path)
    VALUES (
      '10000000-0000-0000-0000-000000000004',
      '10000000-0000-0000-0000-000000000004/20000000-0000-0000-0000-000000000004/orphan.png'
    )$$,
  '42501',
  NULL,
  'an unapproved employee cannot create cleanup queue rows'
);

SELECT extensions.is(
  (SELECT count(*) FROM public.work_timeline_entries), 0::bigint,
  'an unapproved employee cannot read entries'
);

SELECT extensions.is(
  (SELECT count(*) FROM public.work_timeline_attachments), 0::bigint,
  'an unapproved employee cannot read attachment metadata'
);

SELECT extensions.throws_ok(
  $$INSERT INTO public.work_timeline_entries (user_id, title)
    VALUES ('10000000-0000-0000-0000-000000000004', '미승인 업무')$$,
  '42501',
  NULL,
  'an unapproved employee cannot create entries'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

SELECT extensions.is(
  (SELECT count(*) FROM public.work_timeline_storage_cleanup_queue), 2::bigint,
  'an approved admin can view all cleanup queue rows'
);

SELECT extensions.is(
  (WITH deleted AS (
    DELETE FROM public.work_timeline_storage_cleanup_queue
    WHERE owner_id = '10000000-0000-0000-0000-000000000002' RETURNING 1
  ) SELECT count(*) FROM deleted), 1::bigint,
  'an approved admin can clear another employee cleanup queue row'
);

SELECT extensions.is(
  (WITH changed AS (
    UPDATE public.work_timeline_entries SET title = '관리자가 수정한 업무'
    WHERE id = '20000000-0000-0000-0000-000000000001' RETURNING 1
  ) SELECT count(*) FROM changed), 0::bigint,
  'an approved admin cannot update another employee entry'
);

SELECT extensions.is(
  (WITH deleted AS (
    DELETE FROM storage.objects WHERE bucket_id = 'work-timeline'
      AND name = '10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000002/admin-cleanup.png'
    RETURNING 1
  ) SELECT count(*) FROM deleted), 1::bigint,
  'an approved admin can delete another employee storage object'
);

SELECT extensions.is(
  (WITH deleted AS (
    DELETE FROM public.work_timeline_entries
    WHERE id = '20000000-0000-0000-0000-000000000002' RETURNING 1
  ) SELECT count(*) FROM deleted), 1::bigint,
  'an approved admin can delete another employee entry'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

SELECT extensions.is(
  (WITH deleted AS (
    DELETE FROM public.work_timeline_entries
    WHERE id = '20000000-0000-0000-0000-000000000001' RETURNING 1
  ) SELECT count(*) FROM deleted), 1::bigint,
  'owner can delete an own entry'
);

SELECT extensions.is(
  (WITH deleted AS (
    DELETE FROM storage.objects WHERE bucket_id = 'work-timeline'
      AND name = '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/original.png'
    RETURNING 1
  ) SELECT count(*) FROM deleted), 1::bigint,
  'owner can clean up storage after the parent entry is deleted'
);

SELECT * FROM extensions.finish();

ROLLBACK;
