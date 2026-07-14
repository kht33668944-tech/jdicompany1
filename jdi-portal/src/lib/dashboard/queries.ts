import type { SupabaseClient } from "@supabase/supabase-js";
import { getWeekRange } from "@/lib/utils/date";
import {
  getTodayAttendanceStatuses,
  getTodayRecord,
  getWeekRecords,
} from "@/lib/attendance/queries";
import { getTodaySchedules } from "@/lib/schedule/queries";
import {
  getDashboardTaskSummaryWindow,
  normalizeDashboardTaskSummarySnapshot,
  type DashboardTaskSummaryResult,
  type DashboardTaskSummaryWindow,
} from "./dashboard-task-summary";
import {
  buildDashboardDataFromSnapshot,
  type DashboardSnapshotData,
} from "./dashboard-snapshot";

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

export interface DashboardData extends DashboardSnapshotData {
  recentActivities: RecentActivity[];
}

export function mapRpcDashboardTaskSummarySnapshot(
  snapshot: unknown,
  window: DashboardTaskSummaryWindow
): DashboardTaskSummaryResult {
  return normalizeDashboardTaskSummarySnapshot(snapshot, window);
}

export async function getDashboardTaskSummaryFallback(
  supabase: SupabaseClient,
  window: DashboardTaskSummaryWindow
): Promise<DashboardTaskSummaryResult> {
  const { data, error } = await supabase.rpc("get_dashboard_task_summaries", {
    p_day_start: window.dayStart,
    p_next_day_start: window.nextDayStart,
    p_limit: 101,
  });
  if (error) throw error;

  return mapRpcDashboardTaskSummarySnapshot(data, window);
}

export async function getDashboardData(
  supabase: SupabaseClient,
  userId: string,
  userName: string,
  canViewCompanyWork: boolean,
  taskSummaryWindow: DashboardTaskSummaryWindow = getDashboardTaskSummaryWindow()
): Promise<DashboardData> {
  const today = taskSummaryWindow.today;
  const { start: weekStart, end: weekEnd } = getWeekRange(new Date(taskSummaryWindow.dayStart));
  const now = new Date();

  const [todayRecord, weekRecords, taskSummary, todaySchedules, todayAttendanceStatuses] = await Promise.all([
    getTodayRecord(supabase, userId),
    getWeekRecords(supabase, userId, weekStart, weekEnd),
    getDashboardTaskSummaryFallback(supabase, taskSummaryWindow),
    getTodaySchedules(supabase, today),
    getTodayAttendanceStatuses(supabase),
  ]);

  const snapshotData = buildDashboardDataFromSnapshot({
    todayRecord,
    weekRecords,
    taskSummary,
    todayAttendanceStatuses,
    schedules: todaySchedules,
  }, {
    userName,
    canViewCompanyWork,
    weekStart,
    now,
  });
  return {
    ...snapshotData,
    recentActivities: [],
  };
}
