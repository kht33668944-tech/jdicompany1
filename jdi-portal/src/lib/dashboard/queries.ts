import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceRecord } from "@/lib/attendance/types";
import type { TaskWithDetails } from "@/lib/tasks/types";
import type { ScheduleWithProfile } from "@/lib/schedule/types";
import { toDateString, getWeekRange, addDays } from "@/lib/utils/date";
import { getTodayRecord, getWeekRecords } from "@/lib/attendance/queries";
import { getTasksWithDetails } from "@/lib/tasks/queries";
import { getTodaySchedules } from "@/lib/schedule/queries";

export interface RecentActivity {
  id: string;
  type: "comment" | "status_change" | "assignee_change" | "priority_change" | "attachment" | "checklist" | "edit";
  content: string | null;
  metadata: Record<string, unknown> | null;
  task_title: string;
  task_id: string;
  user_name: string;
  user_avatar: string | null;
  created_at: string;
}

export interface DashboardData {
  todayRecord: AttendanceRecord | null;
  weeklyMinutes: number;
  weekdayWorked: boolean[];
  myTasks: TaskWithDetails[];
  allTasksForUser: TaskWithDetails[];
  todaySchedules: ScheduleWithProfile[];
  recentActivities: RecentActivity[];
  nextScheduleMinutes: number | null;
  userName: string;
}

export async function getDashboardData(
  supabase: SupabaseClient,
  userId: string,
  userName: string
): Promise<DashboardData> {
  const today = toDateString();
  const { start: weekStart, end: weekEnd } = getWeekRange();

  const [todayRecord, weekRecords, allTasks, todaySchedules, recentActivities] =
    await Promise.all([
      getTodayRecord(supabase, userId),
      getWeekRecords(supabase, userId, weekStart, weekEnd),
      getTasksWithDetails(supabase),
      getTodaySchedules(supabase, today),
      fetchRecentActivities(supabase, 15),
    ]);

  // 내게 배정된 할일 (전체 — 완료 포함)
  const allTasksForUser = allTasks.filter(
    (t) => t.assignees.some((a) => a.user_id === userId)
  );

  // 미완료만
  const myTasks = allTasksForUser.filter((t) => t.status !== "완료");

  // 주간 근무시간 합산
  const weeklyMinutes = weekRecords.reduce(
    (sum, r) => sum + (r.total_minutes ?? 0),
    0
  );

  // 요일별 출근 여부 (월~금)
  const weekdayWorked: boolean[] = [];
  for (let i = 0; i < 5; i++) {
    const dateStr = addDays(weekStart, i);
    weekdayWorked.push(weekRecords.some((r) => r.work_date === dateStr));
  }

  // 다음 일정까지 남은 분
  const now = new Date();
  let nextScheduleMinutes: number | null = null;
  for (const s of todaySchedules) {
    const start = new Date(s.start_time);
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
    todaySchedules,
    recentActivities,
    nextScheduleMinutes,
    userName,
  };
}

async function fetchRecentActivities(
  supabase: SupabaseClient,
  limit: number
): Promise<RecentActivity[]> {
  const { data, error } = await supabase
    .from("task_activities")
    .select(
      `
      id,
      type,
      content,
      metadata,
      task_id,
      created_at,
      tasks!inner(title),
      profiles!task_activities_user_id_fkey(full_name, avatar_url)
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!data) return [];

  return data.map((row: Record<string, unknown>) => {
    const tasks = row.tasks as { title: string } | null;
    const profiles = row.profiles as { full_name: string; avatar_url: string | null } | null;
    return {
      id: row.id as string,
      type: row.type as RecentActivity["type"],
      content: row.content as string | null,
      metadata: row.metadata as Record<string, unknown> | null,
      task_title: tasks?.title ?? "",
      task_id: row.task_id as string,
      user_name: profiles?.full_name ?? "",
      user_avatar: profiles?.avatar_url ?? null,
      created_at: row.created_at as string,
    };
  });
}
