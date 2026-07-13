import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getWeekRange, toDateString } from "@/lib/utils/date";
import { getPool, isPostgresUsable, markPostgresUnavailable } from "@/lib/db/postgres";
import { measureOperation } from "@/lib/performance/timing";
import {
  buildDashboardDataFromSnapshot,
  type DashboardSnapshot,
} from "./dashboard-snapshot";
import { getDashboardData, type DashboardData } from "./queries";

const DASHBOARD_SNAPSHOT_QUERY = `
  with parameters as (
    select
      $1::uuid as user_id,
      $2::date as today,
      $3::date as week_start,
      $4::date as week_end,
      $5::timestamptz as day_start,
      $6::timestamptz as day_end,
      $7::boolean as can_view_company_work
  ),
  today_record as (
    select to_jsonb(ar) as value
    from public.attendance_records ar
    cross join parameters prm
    where ar.user_id = prm.user_id and ar.work_date = prm.today
    limit 1
  ),
  task_rows as (
    select t.*, p.full_name as creator_full_name, p.avatar_url as creator_avatar_url
    from public.tasks t
    cross join parameters prm
    left join public.profiles p on p.id = t.created_by
    where (
      prm.can_view_company_work
      or exists (
        select 1
        from public.task_assignees ta
        where ta.task_id = t.id and ta.user_id = prm.user_id
      )
    )
    and (
      t.status in ('\uB300\uAE30', '\uC9C4\uD589\uC911')
      or (
        t.status = '\uC644\uB8CC'
        and t.completed_at >= (
          (now() at time zone 'Asia/Seoul') - interval '7 days'
        ) at time zone 'Asia/Seoul'
      )
    )
  ),
  tasks as (
    select coalesce(
      jsonb_agg(
        (
          to_jsonb(t) - 'creator_full_name' - 'creator_avatar_url'
        ) || jsonb_build_object(
          'creator_profile', jsonb_build_object(
            'full_name', coalesce(t.creator_full_name, ''),
            'avatar_url', t.creator_avatar_url
          ),
          'assignees', coalesce((
            select jsonb_agg(jsonb_build_object(
              'user_id', ta.user_id,
              'full_name', coalesce(assignee_profile.full_name, ''),
              'avatar_url', assignee_profile.avatar_url
            ))
            from public.task_assignees ta
            left join public.profiles assignee_profile on assignee_profile.id = ta.user_id
            where ta.task_id = t.id
          ), '[]'::jsonb),
          'checklist_total', 0,
          'checklist_completed', 0,
          'subtask_count', 0,
          'comment_count', 0,
          'attachment_count', 0
        )
        order by t.position asc, t.due_date asc nulls last
      ),
      '[]'::jsonb
    ) as value
    from task_rows t
  ),
  schedule_rows as (
    select s.*, p.full_name as creator_full_name
    from public.schedules s
    cross join parameters prm
    left join public.profiles p on p.id = s.created_by
    where s.start_time <= prm.day_end
      and s.end_time >= prm.day_start
      and (
        prm.can_view_company_work
        or s.visibility = 'company'
        or s.created_by = prm.user_id
        or exists (
          select 1
          from public.schedule_participants sp
          where sp.schedule_id = s.id and sp.user_id = prm.user_id
        )
      )
  ),
  schedules as (
    select coalesce(
      jsonb_agg(
        (
          to_jsonb(s) - 'creator_full_name'
        ) || jsonb_build_object(
          'creator_profile', jsonb_build_object('full_name', coalesce(s.creator_full_name, '')),
          'schedule_participants', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', sp.id,
              'user_id', sp.user_id,
              'profiles', jsonb_build_object('full_name', coalesce(participant_profile.full_name, ''))
            ))
            from public.schedule_participants sp
            left join public.profiles participant_profile on participant_profile.id = sp.user_id
            where sp.schedule_id = s.id
          ), '[]'::jsonb)
        )
        order by s.start_time asc
      ),
      '[]'::jsonb
    ) as value
    from schedule_rows s
  )
  select jsonb_build_object(
    'todayRecord', coalesce((select value from today_record), 'null'::jsonb),
    'weekRecords', coalesce((
      select jsonb_agg(to_jsonb(ar) order by ar.work_date asc)
      from public.attendance_records ar
      cross join parameters prm
      where ar.user_id = prm.user_id
        and ar.work_date >= prm.week_start
        and ar.work_date <= prm.week_end
    ), '[]'::jsonb),
    'tasks', (select value from tasks),
    'profiles', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.full_name asc)
      from public.profiles p
      where p.is_approved = true
    ), '[]'::jsonb),
    'todayAttendanceStatuses', coalesce((
      select jsonb_agg(
        jsonb_build_object('user_id', ar.user_id, 'status', ar.status)
        order by ar.check_in asc
      )
      from public.attendance_records ar
      cross join parameters prm
      where ar.work_date = prm.today
    ), '[]'::jsonb),
    'schedules', (select value from schedules)
  ) as snapshot
`;

interface DashboardSnapshotRow {
  snapshot: DashboardSnapshot;
}

async function getDashboardDataViaPostgres(
  userId: string,
  userName: string,
  canViewCompanyWork: boolean,
  requestId: string
): Promise<DashboardData> {
  const today = toDateString();
  const { start: weekStart, end: weekEnd } = getWeekRange();
  const dayStart = `${today}T00:00:00+09:00`;
  const dayEnd = `${today}T23:59:59+09:00`;
  const pool = getPool();
  const result = await measureOperation(
    {
      route: "/dashboard",
      operation: "postgres.dashboard_snapshot",
      requestId,
    },
    () => pool.query<DashboardSnapshotRow>(DASHBOARD_SNAPSHOT_QUERY, [
      userId,
      today,
      weekStart,
      weekEnd,
      dayStart,
      dayEnd,
      canViewCompanyWork,
    ])
  );
  const snapshot = result.rows[0]?.snapshot;
  if (!snapshot) throw new Error("Dashboard snapshot query returned no data");

  return buildDashboardDataFromSnapshot(snapshot, {
    userId,
    userName,
    canViewCompanyWork,
    weekStart,
    now: new Date(),
    completedTaskStatus: "\uC644\uB8CC",
  });
}

export async function getDashboardDataFast(
  supabase: SupabaseClient,
  userId: string,
  userName: string,
  canViewCompanyWork: boolean
): Promise<DashboardData> {
  if (!isPostgresUsable()) {
    return getDashboardData(supabase, userId, userName, canViewCompanyWork);
  }

  try {
    return await getDashboardDataViaPostgres(
      userId,
      userName,
      canViewCompanyWork,
      randomUUID()
    );
  } catch {
    markPostgresUnavailable();
    return getDashboardData(supabase, userId, userName, canViewCompanyWork);
  }
}
