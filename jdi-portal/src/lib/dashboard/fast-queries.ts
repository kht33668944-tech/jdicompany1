import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceRecord } from "@/lib/attendance/types";
import type { TaskAssignee, TaskWithDetails } from "@/lib/tasks/types";
import type { ScheduleWithProfile } from "@/lib/schedule/types";
import { addDays, getWeekRange, toDateString } from "@/lib/utils/date";
import { sortTasks } from "@/lib/tasks/utils";
import { getPool } from "@/lib/db/postgres";
import { getDashboardData, type DashboardData, type RecentActivity } from "./queries";

type TaskRow = TaskWithDetails & {
  creator_full_name: string | null;
  creator_avatar_url: string | null;
};

type AssigneeRow = {
  task_id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type ScheduleRow = ScheduleWithProfile & {
  creator_full_name: string | null;
};

type ActivityRow = RecentActivity;

function mapTasks(rows: TaskRow[], assigneeRows: AssigneeRow[]): TaskWithDetails[] {
  const assigneesByTask = new Map<string, TaskAssignee[]>();
  for (const row of assigneeRows) {
    const arr = assigneesByTask.get(row.task_id) ?? [];
    arr.push({
      user_id: row.user_id,
      full_name: row.full_name ?? "",
      avatar_url: row.avatar_url,
    });
    assigneesByTask.set(row.task_id, arr);
  }

  return rows.map((row) => ({
    ...row,
    creator_profile: {
      full_name: row.creator_full_name ?? "",
      avatar_url: row.creator_avatar_url,
    },
    assignees: assigneesByTask.get(row.id) ?? [],
    checklist_total: 0,
    checklist_completed: 0,
    subtask_count: 0,
    comment_count: 0,
    attachment_count: 0,
  }));
}

function mapSchedules(rows: ScheduleRow[]): ScheduleWithProfile[] {
  return rows.map((row) => ({
    ...row,
    creator_profile: { full_name: row.creator_full_name ?? "" },
    schedule_participants: [],
  }));
}

async function getDashboardDataViaPostgres(
  userId: string,
  userName: string
): Promise<DashboardData> {
  const today = toDateString();
  const { start: weekStart, end: weekEnd } = getWeekRange();
  const dayStart = `${today}T00:00:00+09:00`;
  const dayEnd = `${today}T23:59:59+09:00`;
  const pool = getPool();

  const [todayRecordResult, weekRecordsResult, tasksResult, schedulesResult, activitiesResult] =
    await Promise.all([
      pool.query(
        `
          select *
          from public.attendance_records
          where user_id = $1 and work_date = $2
          limit 1
        `,
        [userId, today]
      ),
      pool.query(
        `
          select *
          from public.attendance_records
          where user_id = $1
            and work_date >= $2
            and work_date <= $3
          order by work_date asc
        `,
        [userId, weekStart, weekEnd]
      ),
      pool.query(
        `
          select t.*, p.full_name as creator_full_name, p.avatar_url as creator_avatar_url
          from public.tasks t
          where exists (
            select 1
            from public.task_assignees ta
            where ta.task_id = t.id and ta.user_id = $1
          )
          order by t.position asc, t.due_date asc nulls last
          limit 100
        `,
        [userId]
      ),
      pool.query(
        `
          select s.*, p.full_name as creator_full_name
          from public.schedules s
          left join public.profiles p on p.id = s.created_by
          where s.start_time <= $1
            and s.end_time >= $2
          order by s.start_time asc
        `,
        [dayEnd, dayStart]
      ),
      pool.query(
        `
          select
            a.id,
            a.type,
            a.content,
            a.metadata,
            a.task_id,
            a.created_at,
            t.title as task_title,
            p.full_name as user_name,
            p.avatar_url as user_avatar
          from public.task_activities a
          join public.tasks t on t.id = a.task_id
          left join public.profiles p on p.id = a.user_id
          order by a.created_at desc
          limit 15
        `
      ),
    ]);

  const taskRows = tasksResult.rows as TaskRow[];
  const taskIds = taskRows.map((task) => task.id);
  const assigneeRows = taskIds.length
    ? (await pool.query(
        `
          select ta.task_id, ta.user_id, p.full_name, p.avatar_url
          from public.task_assignees ta
          left join public.profiles p on p.id = ta.user_id
          where ta.task_id = any($1::uuid[])
        `,
        [taskIds]
      )).rows as AssigneeRow[]
    : [];

  const weekRecords = weekRecordsResult.rows as AttendanceRecord[];
  const allTasksForUser = mapTasks(taskRows, assigneeRows);
  const myTasks = sortTasks(
    allTasksForUser.filter((task) => task.status !== "완료"),
    "due_date"
  );
  const weeklyMinutes = weekRecords.reduce((sum, row) => sum + (row.total_minutes ?? 0), 0);
  const weekdayWorked = Array.from({ length: 5 }, (_, index) => {
    const dateStr = addDays(weekStart, index);
    return weekRecords.some((row) => row.work_date === dateStr);
  });

  const now = new Date();
  let nextScheduleMinutes: number | null = null;
  const todaySchedules = mapSchedules(schedulesResult.rows as ScheduleRow[]);
  for (const schedule of todaySchedules) {
    const start = new Date(schedule.start_time);
    if (start > now) {
      nextScheduleMinutes = Math.round((start.getTime() - now.getTime()) / 60000);
      break;
    }
  }

  return {
    todayRecord: (todayRecordResult.rows[0] as AttendanceRecord | undefined) ?? null,
    weeklyMinutes,
    weekdayWorked,
    myTasks,
    allTasksForUser,
    todaySchedules,
    recentActivities: activitiesResult.rows as ActivityRow[],
    nextScheduleMinutes,
    userName,
  };
}

export async function getDashboardDataFast(
  supabase: SupabaseClient,
  userId: string,
  userName: string
): Promise<DashboardData> {
  if (!process.env.DATABASE_URL) {
    return getDashboardData(supabase, userId, userName);
  }

  try {
    return await getDashboardDataViaPostgres(userId, userName);
  } catch (error) {
    console.error("[dashboard] postgres data failed, falling back:", error);
    return getDashboardData(supabase, userId, userName);
  }
}
