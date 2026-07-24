import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getWeekRange } from "@/lib/utils/date";
import {
  getPool,
  hasPostgresUrl,
  isPostgresUsable,
  markPostgresUnavailable,
} from "@/lib/db/postgres";
import { measureOperation } from "@/lib/performance/timing";
import {
  getDashboardTaskSummaryWindow,
  normalizeDashboardTaskSummaryResult,
  type DashboardTaskSummaryResult,
  type DashboardTaskSummaryWindow,
} from "./dashboard-task-summary";
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
      $7::timestamptz as next_day_start,
      $8::boolean as can_view_company_work
  ),
  approved_requester as (
    select requester.id
    from public.profiles requester
    cross join parameters prm
    where requester.id = prm.user_id
      and requester.is_approved = true
  ),
  today_record as (
    select to_jsonb(ar) as value
    from public.attendance_records ar
    cross join parameters prm
    where ar.user_id = prm.user_id and ar.work_date = prm.today
    limit 1
  ),
  classified_task_rows as (
    select
      t.id,
      t.title,
      t.status,
      t.priority,
      t.due_date,
      t.start_date,
      t.position,
      t.parent_id,
      t.project_id,
      t.created_by,
      t.created_at,
      t.updated_at,
      t.completed_at,
      case
        when t.status in ('대기', '진행중')
          and t.due_date is not null and t.due_date < prm.today then 0
        when t.status in ('대기', '진행중')
          and t.due_date = prm.today then 1
        when t.status in ('대기', '진행중')
          and t.due_date is not null and t.due_date > prm.today then 2
        when t.status in ('대기', '진행중')
          and t.start_date is not null
          and t.start_date < (prm.next_day_start at time zone 'Asia/Seoul')::date then 3
        when t.status in ('대기', '진행중')
          and t.due_date is null and t.start_date is null then 4
        when t.status = '완료'
          and t.completed_at >= prm.day_start
          and t.completed_at < prm.next_day_start then 5
        else null
      end as class_rank
    from public.tasks t
    cross join parameters prm
    cross join approved_requester
    -- 인덱스 활용을 위한 사전 필터: class_rank 가 non-null 이 될 수 있는 행만 스캔한다.
    -- (미완료 업무 전체 + 오늘 완료된 업무) 이외의 과거 완료 업무는 결과에서 어차피
    -- class_rank is null 로 제외되므로, 여기서 미리 걸러도 결과는 동일하다.
    where t.status in ('대기', '진행중')
      or (
        t.status = '완료'
        and t.completed_at >= prm.day_start
        and t.completed_at < prm.next_day_start
      )
  ),
  ranked_task_rows as (
    select
      t.*,
      case
        when t.class_rank in (0, 1, 2) then t.due_date::timestamp at time zone 'Asia/Seoul'
        when t.class_rank = 3 then t.start_date::timestamp at time zone 'Asia/Seoul'
        when t.class_rank = 4 then t.created_at
        when t.class_rank = 5 then t.completed_at
        else null
      end as relevant_at,
      case
        when t.status = '진행중' then 0
        when t.status = '대기' then 1
        else 2
      end as status_rank
    from classified_task_rows t
    where t.class_rank is not null
  ),
  task_summary_rows as (
    select *
    from ranked_task_rows t
    order by
      t.class_rank asc,
      case when t.class_rank = 5 then t.relevant_at end desc nulls last,
      case when t.class_rank <> 5 then t.relevant_at end asc nulls last,
      t.status_rank asc,
      t.position asc nulls last,
      t.created_at asc,
      t.id asc
    limit 101
  ),
  dashboard_tasks as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'status', t.status,
          'priority', t.priority,
          'due_date', t.due_date,
          'start_date', t.start_date,
          'position', t.position,
          'parent_id', t.parent_id,
          'project_id', t.project_id,
          'project', (
            select jsonb_build_object('id', pj.id, 'name', pj.name, 'color', pj.color)
            from public.projects pj
            where pj.id = t.project_id
          ),
          'created_by', t.created_by,
          'created_at', t.created_at,
          'updated_at', t.updated_at,
          'completed_at', t.completed_at,
          'assignees', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'user_id', ta.user_id,
                'full_name', assignee.full_name,
                'avatar_url', assignee.avatar_url
              ) order by ta.user_id asc
            )
            from public.task_assignees ta
            join public.profiles assignee
              on assignee.id = ta.user_id
              and assignee.is_approved = true
            where ta.task_id = t.id
          ), '[]'::jsonb)
        ) order by
          t.class_rank asc,
          case when t.class_rank = 5 then t.relevant_at end desc nulls last,
          case when t.class_rank <> 5 then t.relevant_at end asc nulls last,
          t.status_rank asc,
          t.position asc nulls last,
          t.created_at asc,
          t.id asc
      ),
      '[]'::jsonb
    ) as value
    from task_summary_rows t
  ),
  dashboard_profiles as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'avatar_url', p.avatar_url,
          'role', p.role
        ) order by p.id asc
      ),
      '[]'::jsonb
    ) as value
    from public.profiles p
    cross join approved_requester
    where p.is_approved = true
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
  ),
  -- 미확인 업무지시: 같은 스냅샷 쿼리 안에서 처리해 DB 왕복을 늘리지 않는다.
  -- work_directive_recipients_pending 부분 인덱스를 탄다 (마이그레이션 103).
  pending_directives as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'recipient_id', r.id,
          'directive_id', d.id,
          'kind', d.kind,
          'title', d.title,
          'body', d.body,
          'priority', d.priority,
          'due_date', d.due_date,
          'project', (
            select jsonb_build_object('id', pj.id, 'name', pj.name, 'color', pj.color)
            from public.projects pj
            where pj.id = d.project_id
          ),
          'sender_name', coalesce(sender.full_name, ''),
          'created_at', r.created_at
        )
        -- 대표님 지시(=admin 발신)를 항상 위로, 그다음 오래된 순
        order by case when d.kind = '지시' then 0 else 1 end asc, r.created_at asc
      ),
      '[]'::jsonb
    ) as value
    from public.work_directive_recipients r
    join public.work_directives d on d.id = r.directive_id
    left join public.profiles sender on sender.id = d.created_by
    cross join parameters prm
    cross join approved_requester
    where r.state = '미확인'
      and r.user_id = prm.user_id
  ),
  directive_pending_counts as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('user_id', c.user_id, 'count', c.pending_count)
        order by c.user_id asc
      ),
      '[]'::jsonb
    ) as value
    from (
      select r.user_id, count(*)::int as pending_count
      from public.work_directive_recipients r
      cross join approved_requester
      where r.state = '미확인'
      group by r.user_id
    ) c
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
    'taskSummary', jsonb_build_object(
      'tasks', (select value from dashboard_tasks),
      'profiles', (select value from dashboard_profiles)
    ),
    'todayAttendanceStatuses', coalesce((
      select jsonb_agg(
        jsonb_build_object('user_id', ar.user_id, 'status', ar.status)
        order by ar.check_in asc
      )
      from public.attendance_records ar
      cross join parameters prm
      where ar.work_date = prm.today
    ), '[]'::jsonb),
    'schedules', (select value from schedules),
    'pendingDirectives', (select value from pending_directives),
    'directivePendingCounts', (select value from directive_pending_counts)
  ) as snapshot
  from approved_requester
`;

interface DashboardTaskSummaryWire {
  tasks: unknown;
  profiles: unknown;
}

interface DashboardSnapshotWire extends Omit<DashboardSnapshot, "taskSummary"> {
  taskSummary: DashboardTaskSummaryWire;
}

interface DashboardSnapshotRow {
  snapshot: DashboardSnapshotWire;
}

type DashboardTaskSummarySource = "pool" | "rpc";
type DashboardTaskSummaryReason =
  | "database-url-absent"
  | "pool-circuit-open"
  | "transient-pool-error"
  | "truncated";

function logDashboardTaskSummary(
  requestId: string,
  source: DashboardTaskSummarySource,
  reasonClass: DashboardTaskSummaryReason,
  taskSummary: DashboardTaskSummaryResult
): void {
  console.info("dashboard task summary", {
    route: "/dashboard",
    requestId,
    source,
    reasonClass,
    count: taskSummary.tasks.length,
    truncated: taskSummary.truncated,
  });
}

const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);
const TRANSIENT_POSTGRES_CODES = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
  "57P01",
  "57P02",
  "57P03",
]);

function getErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = error.code;
  return typeof code === "string" ? code : null;
}

function getErrorMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("message" in error)) return null;
  const message = error.message;
  return typeof message === "string" ? message : null;
}

export function isTransientDashboardPoolError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code !== null && (TRANSIENT_NETWORK_CODES.has(code) || TRANSIENT_POSTGRES_CODES.has(code))) {
    return true;
  }

  const message = getErrorMessage(error);
  return message === "Connection terminated due to connection timeout"
    || message?.startsWith("timeout exceeded when trying to connect") === true;
}

export function mapFastDashboardTaskSummaryRows(
  rows: unknown,
  profiles: unknown,
  window: DashboardTaskSummaryWindow
): DashboardTaskSummaryResult {
  return normalizeDashboardTaskSummaryResult(rows, profiles, window);
}

async function getDashboardDataViaPostgres(
  userId: string,
  userName: string,
  canViewCompanyWork: boolean,
  requestId: string,
  taskSummaryWindow: DashboardTaskSummaryWindow,
  now: Date
): Promise<DashboardData> {
  const { start: weekStart, end: weekEnd } = getWeekRange(new Date(taskSummaryWindow.dayStart));
  const dayEnd = `${taskSummaryWindow.today}T23:59:59+09:00`;
  const pool = getPool();
  const result = await measureOperation(
    {
      route: "/dashboard",
      operation: "postgres.dashboard_snapshot",
      requestId,
    },
    () => pool.query<DashboardSnapshotRow>(DASHBOARD_SNAPSHOT_QUERY, [
      userId,
      taskSummaryWindow.today,
      weekStart,
      weekEnd,
      taskSummaryWindow.dayStart,
      dayEnd,
      taskSummaryWindow.nextDayStart,
      canViewCompanyWork,
    ])
  );
  const snapshot = result.rows[0]?.snapshot;
  if (!snapshot) throw new Error("Dashboard snapshot query returned no data");

  const taskSummary = mapFastDashboardTaskSummaryRows(
    snapshot.taskSummary.tasks,
    snapshot.taskSummary.profiles,
    taskSummaryWindow
  );
  const snapshotDataWithSummary = buildDashboardDataFromSnapshot({
    ...snapshot,
    taskSummary,
  }, {
    userName,
    canViewCompanyWork,
    weekStart,
    now,
  });
  const data: DashboardData = {
    ...snapshotDataWithSummary,
    recentActivities: [],
  };

  if (taskSummary.truncated) {
    logDashboardTaskSummary(requestId, "pool", "truncated", taskSummary);
  }
  return data;
}

async function getDashboardDataViaFallback(
  supabase: SupabaseClient,
  userId: string,
  userName: string,
  canViewCompanyWork: boolean,
  requestId: string,
  taskSummaryWindow: DashboardTaskSummaryWindow,
  reasonClass: Exclude<DashboardTaskSummaryReason, "truncated">
): Promise<DashboardData> {
  const data = await getDashboardData(
    supabase,
    userId,
    userName,
    canViewCompanyWork,
    taskSummaryWindow
  );
  logDashboardTaskSummary(requestId, "rpc", reasonClass, data.taskSummary);
  return data;
}

export async function getDashboardDataFast(
  supabase: SupabaseClient,
  userId: string,
  userName: string,
  canViewCompanyWork: boolean
): Promise<DashboardData> {
  const now = new Date();
  const taskSummaryWindow = getDashboardTaskSummaryWindow(now);
  const requestId = randomUUID();

  if (!hasPostgresUrl()) {
    return getDashboardDataViaFallback(
      supabase,
      userId,
      userName,
      canViewCompanyWork,
      requestId,
      taskSummaryWindow,
      "database-url-absent"
    );
  }
  if (!isPostgresUsable()) {
    return getDashboardDataViaFallback(
      supabase,
      userId,
      userName,
      canViewCompanyWork,
      requestId,
      taskSummaryWindow,
      "pool-circuit-open"
    );
  }

  try {
    return await getDashboardDataViaPostgres(
      userId,
      userName,
      canViewCompanyWork,
      requestId,
      taskSummaryWindow,
      now
    );
  } catch (error) {
    if (!isTransientDashboardPoolError(error)) throw error;
    markPostgresUnavailable();
    try {
      return await getDashboardDataViaFallback(
        supabase,
        userId,
        userName,
        canViewCompanyWork,
        requestId,
        taskSummaryWindow,
        "transient-pool-error"
      );
    } catch (fallbackError) {
      throw new AggregateError(
        [error, fallbackError],
        "Dashboard task summary fallback failed"
      );
    }
  }
}
