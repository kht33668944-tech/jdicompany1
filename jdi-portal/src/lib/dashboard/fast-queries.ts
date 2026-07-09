import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceRecord, Profile } from "@/lib/attendance/types";
import type { TaskAssignee, TaskWithDetails } from "@/lib/tasks/types";
import type { ScheduleWithProfile } from "@/lib/schedule/types";
import { addDays, getWeekRange, toDateString } from "@/lib/utils/date";
import { sortTasks } from "@/lib/tasks/utils";
import { getPool, isPostgresUsable, markPostgresUnavailable } from "@/lib/db/postgres";
import { getDashboardData, type DashboardData } from "./queries";

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

type ScheduleParticipantRow = {
  schedule_id: string;
  id: string;
  user_id: string;
  full_name: string | null;
};

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

function mapSchedules(
  rows: ScheduleRow[],
  participantRows: ScheduleParticipantRow[]
): ScheduleWithProfile[] {
  const participantsBySchedule = new Map<string, ScheduleWithProfile["schedule_participants"]>();
  for (const row of participantRows) {
    const arr = participantsBySchedule.get(row.schedule_id) ?? [];
    arr.push({
      id: row.id,
      user_id: row.user_id,
      profiles: { full_name: row.full_name ?? "" },
    });
    participantsBySchedule.set(row.schedule_id, arr);
  }

  return rows.map((row) => ({
    ...row,
    creator_profile: { full_name: row.creator_full_name ?? "" },
    schedule_participants: participantsBySchedule.get(row.id) ?? [],
  }));
}

async function getDashboardDataViaPostgres(
  userId: string,
  userName: string,
  canViewCompanyWork: boolean,
  currentProfile: Profile
): Promise<DashboardData> {
  const today = toDateString();
  const { start: weekStart, end: weekEnd } = getWeekRange();
  const dayStart = `${today}T00:00:00+09:00`;
  const dayEnd = `${today}T23:59:59+09:00`;
  const pool = getPool();

  const taskQuery = canViewCompanyWork
    ? {
        text: `
          select t.*, p.full_name as creator_full_name, p.avatar_url as creator_avatar_url
          from public.tasks t
          left join public.profiles p on p.id = t.created_by
          where (
            t.status in ('대기', '진행중')
            or (t.status = '완료' and t.updated_at >= now() - interval '7 days')
          )
          order by t.position asc, t.due_date asc nulls last
        `,
        values: [],
      }
    : {
        text: `
          select t.*, p.full_name as creator_full_name, p.avatar_url as creator_avatar_url
          from public.tasks t
          left join public.profiles p on p.id = t.created_by
          where exists (
            select 1
            from public.task_assignees ta
            where ta.task_id = t.id and ta.user_id = $1
          )
          and (
            t.status in ('대기', '진행중')
            or (t.status = '완료' and t.updated_at >= now() - interval '7 days')
          )
          order by t.position asc, t.due_date asc nulls last
        `,
        values: [userId],
      };

  const scheduleQuery = canViewCompanyWork
    ? {
        text: `
          select s.*, p.full_name as creator_full_name
          from public.schedules s
          left join public.profiles p on p.id = s.created_by
          where s.start_time <= $1
            and s.end_time >= $2
          order by s.start_time asc
        `,
        values: [dayEnd, dayStart],
      }
    : {
        text: `
          select s.*, p.full_name as creator_full_name
          from public.schedules s
          left join public.profiles p on p.id = s.created_by
          where s.start_time <= $1
            and s.end_time >= $2
            and (
              s.visibility = 'company'
              or s.created_by = $3
              or exists (
                select 1
                from public.schedule_participants sp
                where sp.schedule_id = s.id and sp.user_id = $3
              )
            )
          order by s.start_time asc
        `,
        values: [dayEnd, dayStart, userId],
      };

  const [todayRecordResult, weekRecordsResult, tasksResult, schedulesResult, profilesResult, attendanceResult] =
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
      pool.query(taskQuery.text, taskQuery.values),
      pool.query(scheduleQuery.text, scheduleQuery.values),
      canViewCompanyWork ? pool.query(
        `
          select *
          from public.profiles
          order by full_name asc
        `
      ) : Promise.resolve({ rows: [currentProfile] }),
      canViewCompanyWork ? pool.query(
        `
          select *
          from public.attendance_records
          where work_date = $1
          order by check_in asc
        `,
        [today]
      ) : Promise.resolve({ rows: [] }),
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

  const scheduleRows = schedulesResult.rows as ScheduleRow[];
  const scheduleIds = scheduleRows.map((schedule) => schedule.id);
  const scheduleParticipantRows = scheduleIds.length
    ? (await pool.query(
        `
          select sp.schedule_id, sp.id, sp.user_id, p.full_name
          from public.schedule_participants sp
          left join public.profiles p on p.id = sp.user_id
          where sp.schedule_id = any($1::uuid[])
        `,
        [scheduleIds]
      )).rows as ScheduleParticipantRow[]
    : [];

  const weekRecords = weekRecordsResult.rows as AttendanceRecord[];
  const todayRecord = (todayRecordResult.rows[0] as AttendanceRecord | undefined) ?? null;
  const allTasks = mapTasks(taskRows, assigneeRows);
  const allTasksForUser = allTasks.filter((task) =>
    task.assignees.some((assignee) => assignee.user_id === userId)
  );
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
  const todaySchedules = mapSchedules(scheduleRows, scheduleParticipantRows);
  for (const schedule of todaySchedules) {
    const start = new Date(schedule.start_time);
    if (start > now) {
      nextScheduleMinutes = Math.round((start.getTime() - now.getTime()) / 60000);
      break;
    }
  }

  return {
    todayRecord,
    weeklyMinutes,
    weekdayWorked,
    myTasks,
    allTasksForUser,
    allTasks,
    allProfiles: profilesResult.rows as Profile[],
    todayAttendanceRecords: canViewCompanyWork ? attendanceResult.rows as AttendanceRecord[] : todayRecord ? [todayRecord] : [],
    todaySchedules,
    recentActivities: [],
    nextScheduleMinutes,
    userName,
    canViewCompanyWork,
  };
}

export async function getDashboardDataFast(
  supabase: SupabaseClient,
  userId: string,
  userName: string,
  canViewCompanyWork: boolean,
  currentProfile: Profile
): Promise<DashboardData> {
  if (!isPostgresUsable()) {
    return getDashboardData(supabase, userId, userName, canViewCompanyWork, currentProfile);
  }

  try {
    return await getDashboardDataViaPostgres(userId, userName, canViewCompanyWork, currentProfile);
  } catch (error) {
    markPostgresUnavailable();
    console.error("[dashboard] postgres data failed, falling back:", error);
    return getDashboardData(supabase, userId, userName, canViewCompanyWork, currentProfile);
  }
}
