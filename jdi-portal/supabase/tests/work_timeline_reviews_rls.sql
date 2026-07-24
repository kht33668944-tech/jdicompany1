-- Run after a local migration reset with: supabase test db
-- All fixtures and mutations are rolled back.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(9);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'review-author@example.test', '', now(), '{}'::jsonb, '{"full_name":"검토 작성자"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'review-reviewer@example.test', '', now(), '{}'::jsonb, '{"full_name":"검토자"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'review-admin@example.test', '', now(), '{}'::jsonb, '{"full_name":"관리자"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'review-thirdparty@example.test', '', now(), '{}'::jsonb, '{"full_name":"제3자"}'::jsonb, now(), now());

UPDATE public.profiles
SET is_approved = true,
    role = CASE WHEN id = '11000000-0000-0000-0000-000000000003' THEN 'admin' ELSE 'employee' END
WHERE id IN (
  '11000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000002',
  '11000000-0000-0000-0000-000000000003',
  '11000000-0000-0000-0000-000000000004'
);

-- 검토 대상 업무보고 (작성자 소유, 완료된 업무 불필요 — work_timeline_entries는 task_id 없이도 생성 가능)
INSERT INTO public.work_timeline_entries (id, user_id, title)
VALUES (
  '21000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  '검토 대상 업무보고'
);

-- 검토 행은 RPC를 거치지 않고 직접 삽입해 RLS SELECT 시나리오만 고립해 검증한다
-- (권한 부여를 위해 postgres 소유자 권한으로 삽입 — RLS는 SELECT만 걸려 있고
--  INSERT/UPDATE 정책이 없으므로 여기서는 RESET ROLE 상태에서 삽입한다)
INSERT INTO public.work_timeline_reviews (id, entry_id, reviewer_id, author_id, comment, state)
VALUES (
  '22000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000002',
  '11000000-0000-0000-0000-000000000001',
  '검토 의견입니다.',
  'open'
);

INSERT INTO public.work_timeline_review_events (id, review_id, actor_id, kind, note)
VALUES (
  '23000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000002',
  'requested',
  '검토 의견입니다.'
);

-- ---------- 작성자(author) ----------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);

SELECT extensions.is(
  (SELECT count(*) FROM public.work_timeline_reviews), 1::bigint,
  'author can select the review'
);

SELECT extensions.is(
  (SELECT count(*) FROM public.work_timeline_review_events), 1::bigint,
  'author can select the review event history'
);

SELECT extensions.throws_ok(
  $$INSERT INTO public.work_timeline_reviews (entry_id, reviewer_id, author_id, comment, state)
    VALUES (
      '21000000-0000-0000-0000-000000000001',
      '11000000-0000-0000-0000-000000000002',
      '11000000-0000-0000-0000-000000000001',
      '직접 INSERT 시도',
      'open'
    )$$,
  '42501',
  NULL,
  'direct client insert into work_timeline_reviews is rejected (RPC-only, no INSERT policy)'
);

SELECT extensions.is(
  (WITH changed AS (
    UPDATE public.work_timeline_reviews SET comment = '직접 UPDATE 시도'
    WHERE id = '22000000-0000-0000-0000-000000000001' RETURNING 1
  ) SELECT count(*) FROM changed), 0::bigint,
  'direct client update to work_timeline_reviews affects zero rows (no UPDATE policy)'
);

RESET ROLE;

-- ---------- 검토자(reviewer) ----------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);

SELECT extensions.is(
  (SELECT count(*) FROM public.work_timeline_reviews), 1::bigint,
  'reviewer can select the review'
);

RESET ROLE;

-- ---------- 관리자(admin) ----------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);

SELECT extensions.is(
  (SELECT count(*) FROM public.work_timeline_reviews), 1::bigint,
  'admin can select the review'
);

SELECT extensions.is(
  (SELECT count(*) FROM public.work_timeline_review_events), 1::bigint,
  'admin can select the review event history'
);

RESET ROLE;

-- ---------- 제3자(요청자·작성자·관리자 아님) ----------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000004', true);

SELECT extensions.is(
  (SELECT count(*) FROM public.work_timeline_reviews), 0::bigint,
  'a third party (not reviewer/author/admin) sees zero review rows'
);

SELECT extensions.is(
  (SELECT count(*) FROM public.work_timeline_review_events), 0::bigint,
  'a third party sees zero review event rows'
);

RESET ROLE;

SELECT * FROM extensions.finish();

ROLLBACK;
