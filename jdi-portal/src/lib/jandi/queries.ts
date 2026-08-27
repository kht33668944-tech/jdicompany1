/**
 * 잔디 보고용 팀 전체 데이터 조회.
 *
 * 대시보드의 스냅샷 경로를 재사용하지 않는 이유: 그쪽은 로그인한 개인의 시야
 * (DashboardSnapshotContext)에 묶여 있다. 보고서는 팀 전체를 봐야 하므로 별도 조회를
 * 둔다. 덕분에 대시보드 초기 데이터(빠른 경로 + RPC 폴백 쌍)를 건드리지 않는다.
 *
 * 폴백을 두지 않는다: 우회하려면 팀 전체를 읽는 RPC 를 새 마이그레이션으로 만들어야
 * 하는데, 하루 두 번 도는 보고를 위해 운영 DB 에 함수를 추가하는 비용이 이득보다 크다.
 * 이 경로는 실패해도 포털 본체에 영향이 없고 다음 회차에 자연히 복구된다.
 */

import { getPool, markPostgresUnavailable } from "@/lib/db/postgres";
import type { ReportData } from "./types";

const REPORT_SQL = `
with params as (
  select (now() at time zone 'Asia/Seoul')::date as today
),
report_tasks as (
  select
    t.id,
    t.title,
    t.status,
    t.due_date,
    t.completed_at,
    coalesce((
      select jsonb_agg(p.full_name order by p.full_name)
      from public.task_assignees ta
      join public.profiles p on p.id = ta.user_id and p.is_approved = true
      where ta.task_id = t.id
    ), '[]'::jsonb) as assignee_names
  from public.tasks t
  cross join params
  where t.status = '진행중'
     or (t.completed_at at time zone 'Asia/Seoul')::date = params.today
     or (t.due_date is not null and t.due_date < params.today and t.status <> '완료')
),
report_entries as (
  select e.id, e.title, p.full_name as author_name, e.created_at
  from public.work_timeline_entries e
  left join public.profiles p on p.id = e.user_id
  cross join params
  where (e.created_at at time zone 'Asia/Seoul')::date = params.today
),
report_reviews as (
  select
    r.id,
    e.title as entry_title,
    ap.full_name as author_name,
    rp.full_name as reviewer_name,
    r.created_at
  from public.work_timeline_reviews r
  join public.work_timeline_entries e on e.id = r.entry_id
  left join public.profiles ap on ap.id = r.author_id
  left join public.profiles rp on rp.id = r.reviewer_id
  where r.state in ('open', 'submitted')
),
report_schedules as (
  select s.id, s.title, s.start_time, s.is_all_day
  from public.schedules s
  cross join params
  where s.start_time <= ((params.today + 1)::text || 'T00:00:00+09:00')::timestamptz
    and s.end_time >= (params.today::text || 'T00:00:00+09:00')::timestamptz
)
select jsonb_build_object(
  'today', (select today::text from params),
  'now', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'tasks', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'title', t.title, 'status', t.status,
      'dueDate', t.due_date, 'completedAt', t.completed_at,
      'assigneeNames', t.assignee_names
    ) order by t.due_date asc nulls last, t.title asc)
    from report_tasks t
  ), '[]'::jsonb),
  'entries', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'title', e.title, 'authorName', e.author_name
    ) order by e.created_at asc)
    from report_entries e
  ), '[]'::jsonb),
  'reviews', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'entryTitle', r.entry_title,
      'authorName', r.author_name, 'reviewerName', r.reviewer_name,
      'createdAt', r.created_at
    ) order by r.created_at asc)
    from report_reviews r
  ), '[]'::jsonb),
  'schedules', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', s.title,
      'startTime', s.start_time, 'isAllDay', s.is_all_day
    ) order by s.start_time asc)
    from report_schedules s
  ), '[]'::jsonb)
) as report
`;

export async function getReportData(): Promise<ReportData> {
  const pool = getPool();
  try {
    const result = await pool.query<{ report: ReportData }>(REPORT_SQL);
    return result.rows[0].report;
  } catch (error) {
    markPostgresUnavailable();
    throw error;
  }
}
