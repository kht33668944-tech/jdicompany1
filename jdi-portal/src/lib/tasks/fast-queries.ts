import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPool,
  hasPostgresUrl,
  isPostgresUsable,
  markPostgresUnavailable,
} from "@/lib/db/postgres";
import { measureOperation } from "@/lib/performance/timing";
import { isTransientDashboardPoolError } from "@/lib/dashboard/fast-queries";
import { getCachedAllProfiles } from "@/lib/attendance/queries.server";
import { getInitialTasksWithDetails, getCompletedCutoff, INITIAL_TASK_LIMIT } from "./queries";
import type { TaskWithDetails } from "./types";
import type { Profile } from "@/lib/attendance/types";

export interface TasksPagePayload {
  profiles: Profile[];
  tasks: TaskWithDetails[];
}

/**
 * 할일 페이지 초기 데이터(직원 목록 + 초기 할일 상세)를 **단일 pg 왕복**으로 가져온다.
 *
 * 기존 REST 경로는 Railway(싱가포르)→Supabase(서울)를 여러 번 순차 왕복했다.
 *   - 직원목록 1회 + 할일목록 1회 → 그 뒤 담당자/카운트 1회 = 병렬이지만 각 호출이
 *     매번 새 HTTPS 연결을 맺어 왕복당 400~900ms 로 부풀었다.
 * 이 쿼리는 유지되는 pg 풀 연결(instrumentation keepalive 로 워밍)로 한 번에 처리한다.
 *
 * 보안: pg 경로는 RLS 를 우회하므로 dashboard/fast-queries.ts 와 동일하게
 * `approved_requester` CTE 로 요청자가 승인 사용자일 때만 데이터를 반환한다.
 *   - tasks SELECT RLS = is_approved_user()  → 승인 사용자는 전체 할일 조회 (일치)
 *   - profiles / assignees / counts 도 승인 사용자에게 전체 공개 (기존 REST 동작과 동일)
 * 승인되지 않은 요청자에게는 approved_requester 가 비어 tasks/profiles 모두 [] 가 된다.
 */
const INITIAL_TASKS_PAGE_QUERY = `
  with parameters as (
    select
      $1::uuid as user_id,
      $2::timestamptz as completed_cutoff,
      $3::int as task_limit
  ),
  approved_requester as (
    select requester.id
    from public.profiles requester
    cross join parameters prm
    where requester.id = prm.user_id
      and requester.is_approved = true
  ),
  active_tasks as (
    select
      t.id,
      0 as grp,
      row_number() over (
        order by t.position asc nulls last, t.created_at asc, t.id asc
      ) as ord
    from public.tasks t
    cross join approved_requester
    where t.status in ('대기', '진행중')
    order by t.position asc nulls last, t.created_at asc, t.id asc
    limit (select task_limit from parameters)
  ),
  active_count as (
    select count(*)::int as c from active_tasks
  ),
  completed_tasks as (
    select
      t.id,
      1 as grp,
      row_number() over (
        order by t.updated_at desc, t.id asc
      ) as ord
    from public.tasks t
    cross join parameters prm
    cross join approved_requester
    where t.status = '완료'
      and t.completed_at >= prm.completed_cutoff
    order by t.updated_at desc, t.id asc
    limit (select task_limit from parameters)
  ),
  selected as (
    select id, grp, ord from active_tasks
    union all
    select id, grp, ord from completed_tasks
    where completed_tasks.ord <= greatest(
      0,
      (select task_limit from parameters) - (select c from active_count)
    )
  ),
  tasks_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'description', t.description,
          'status', t.status,
          'priority', t.priority,
          'category', t.category,
          'due_date', t.due_date,
          'start_date', t.start_date,
          'position', t.position,
          'parent_id', t.parent_id,
          'created_by', t.created_by,
          'created_at', t.created_at,
          'updated_at', t.updated_at,
          'completed_at', t.completed_at,
          'creator_profile', (
            select jsonb_build_object(
              'full_name', cp.full_name,
              'avatar_url', cp.avatar_url
            )
            from public.profiles cp
            where cp.id = t.created_by
          ),
          'assignees', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'user_id', ta.user_id,
                'full_name', coalesce(ap.full_name, ''),
                'avatar_url', ap.avatar_url
              ) order by ta.user_id asc
            )
            from public.task_assignees ta
            left join public.profiles ap on ap.id = ta.user_id
            where ta.task_id = t.id
          ), '[]'::jsonb),
          'comment_count', coalesce((
            select count(*)::int from public.task_activities a
            where a.task_id = t.id and a.type = 'comment'
          ), 0),
          'attachment_count', coalesce((
            select count(*)::int from public.task_attachments att
            where att.task_id = t.id
          ), 0),
          'subtask_count', coalesce((
            select count(*)::int from public.tasks st
            where st.parent_id = t.id
          ), 0),
          'checklist_total', coalesce((
            select count(*)::int from public.task_checklist_items ci
            where ci.task_id = t.id
          ), 0),
          'checklist_completed', coalesce((
            select count(*)::int from public.task_checklist_items ci
            where ci.task_id = t.id and ci.is_completed
          ), 0)
        ) order by s.grp asc, s.ord asc
      ),
      '[]'::jsonb
    ) as value
    from selected s
    join public.tasks t on t.id = s.id
  ),
  profiles_json as (
    select coalesce(
      jsonb_agg(to_jsonb(p) order by p.full_name asc),
      '[]'::jsonb
    ) as value
    from public.profiles p
    cross join approved_requester
  )
  select jsonb_build_object(
    'tasks', (select value from tasks_json),
    'profiles', (select value from profiles_json)
  ) as payload
  from approved_requester
`;

interface TasksPagePayloadRow {
  payload: {
    tasks: TaskWithDetails[];
    profiles: Profile[];
  } | null;
}

type FastPayloadSource = "pool" | "rest";
type FastPayloadReason =
  | "database-url-absent"
  | "pool-circuit-open"
  | "transient-pool-error";

function logTasksPagePayload(
  requestId: string,
  source: FastPayloadSource,
  reasonClass: FastPayloadReason | "ok",
  payload: TasksPagePayload
): void {
  console.info("tasks page payload", {
    route: "/dashboard/tasks",
    requestId,
    source,
    reasonClass,
    taskCount: payload.tasks.length,
    profileCount: payload.profiles.length,
  });
}

/** REST 폴백 — 기존 병렬 경로(직원목록 + 초기 할일)를 그대로 사용한다. */
async function getTasksPagePayloadViaRest(
  supabase: SupabaseClient
): Promise<TasksPagePayload> {
  const [profiles, tasks] = await Promise.all([
    getCachedAllProfiles(),
    getInitialTasksWithDetails(supabase),
  ]);
  return { profiles, tasks };
}

async function getTasksPagePayloadViaPostgres(
  userId: string,
  requestId: string
): Promise<TasksPagePayload> {
  const pool = getPool();
  const result = await measureOperation(
    {
      route: "/dashboard/tasks",
      operation: "postgres.tasks_page_payload",
      requestId,
    },
    () =>
      pool.query<TasksPagePayloadRow>(INITIAL_TASKS_PAGE_QUERY, [
        userId,
        getCompletedCutoff(),
        INITIAL_TASK_LIMIT,
      ])
  );
  const payload = result.rows[0]?.payload;
  // approved_requester 가 비면 행 자체가 없다 → 승인 사용자가 아니거나 데이터 없음.
  return {
    profiles: payload?.profiles ?? [],
    tasks: payload?.tasks ?? [],
  };
}

/**
 * 할일 페이지 초기 데이터. 빠른 경로(pg) 우선, 실패/미가용 시 기존 REST 경로로 폴백.
 */
export async function getTasksPagePayloadFast(
  supabase: SupabaseClient,
  userId: string
): Promise<TasksPagePayload> {
  const requestId = randomUUID();

  if (!hasPostgresUrl()) {
    const payload = await getTasksPagePayloadViaRest(supabase);
    logTasksPagePayload(requestId, "rest", "database-url-absent", payload);
    return payload;
  }
  if (!isPostgresUsable()) {
    const payload = await getTasksPagePayloadViaRest(supabase);
    logTasksPagePayload(requestId, "rest", "pool-circuit-open", payload);
    return payload;
  }

  try {
    const payload = await getTasksPagePayloadViaPostgres(userId, requestId);
    logTasksPagePayload(requestId, "pool", "ok", payload);
    return payload;
  } catch (error) {
    // 일시적 연결 오류면 회로를 열어 잠시 REST 로 우회한다.
    // 그 외(쿼리 오류 등)는 회로를 열지 않되, 페이지가 빈 채로 깨지지 않도록
    // 반드시 REST 로 폴백하고 오류를 로그로 남긴다(조용한 실패 금지).
    if (isTransientDashboardPoolError(error)) {
      markPostgresUnavailable();
    } else {
      console.error("[tasks-fast] postgres path failed, falling back to REST:", error);
    }
    const payload = await getTasksPagePayloadViaRest(supabase);
    logTasksPagePayload(requestId, "rest", "transient-pool-error", payload);
    return payload;
  }
}
