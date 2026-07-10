import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceRecord, Profile } from "@/lib/attendance/types";
import type { TaskWithDetails } from "@/lib/tasks/types";
import type { ScheduleWithProfile } from "@/lib/schedule/types";
import { toDateString, getWeekRange, addDays } from "@/lib/utils/date";
import { getAllProfiles, getAllTodayAttendance, getTodayRecord, getWeekRecords } from "@/lib/attendance/queries";
import { getTasksWithDetails } from "@/lib/tasks/queries";
import { getTodaySchedules } from "@/lib/schedule/queries";
import { sortTasks } from "@/lib/tasks/utils";

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
  allTasks: TaskWithDetails[];
  allProfiles: Profile[];
  todayAttendanceRecords: AttendanceRecord[];
  todaySchedules: ScheduleWithProfile[];
  recentActivities: RecentActivity[];
  nextScheduleMinutes: number | null;
  userName: string;
  canViewCompanyWork: boolean;
}

export async function getDashboardData(
  supabase: SupabaseClient,
  userId: string,
  userName: string,
  canViewCompanyWork: boolean,
  currentProfile: Profile
): Promise<DashboardData> {
  const today = toDateString();
  const { start: weekStart, end: weekEnd } = getWeekRange();

  const [todayRecord, weekRecords, allTasks, todaySchedules] = await Promise.all([
    getTodayRecord(supabase, userId),
    getWeekRecords(supabase, userId, weekStart, weekEnd),
    getTasksWithDetails(supabase),
    getTodaySchedules(supabase, today),
  ]);

  const [allProfiles, todayAttendanceRecords] = canViewCompanyWork
    ? await Promise.all([getAllProfiles(supabase), getAllTodayAttendance(supabase)])
    : [[currentProfile], todayRecord ? [todayRecord] : []];

  const allTasksForUser = allTasks.filter((task) =>
    task.assignees.some((assignee) => assignee.user_id === userId)
  );

  // 미완료만, 마감일순 정렬
  const myTasks = sortTasks(
    allTasksForUser.filter((t) => t.status !== "완료"),
    "due_date"
  );

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
    allTasks,
    allProfiles,
    todayAttendanceRecords,
    todaySchedules,
    recentActivities: [],
    nextScheduleMinutes,
    userName,
    canViewCompanyWork,
  };
}
