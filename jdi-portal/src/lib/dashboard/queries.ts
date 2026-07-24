import type { SupabaseClient } from "@supabase/supabase-js";
import { getWeekRange } from "@/lib/utils/date";
import {
  getTodayAttendanceStatuses,
  getTodayRecord,
  getWeekRecords,
} from "@/lib/attendance/queries";
import { getTodaySchedules } from "@/lib/schedule/queries";
import type { DirectivePendingCount, PendingDirective } from "@/lib/directives/types";
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

interface PendingDirectiveRow {
  id: string;
  directive_id: string;
  created_at: string;
  work_directives: {
    kind: PendingDirective["kind"];
    title: string;
    body: string;
    priority: string | null;
    due_date: string | null;
    project: { id: string; name: string; color: string } | null;
    profiles: { full_name: string | null } | null;
  } | null;
}

/**
 * 폴백 경로의 미확인 업무지시 조회.
 * 빠른 경로(fast-queries.ts 의 pending_directives CTE)와 반드시 같은 결과를 내야 한다.
 * 한쪽만 고치면 운영에서만 안 보이는 사고가 난다 (성능 불변조건 3).
 */
async function getPendingDirectives(
  supabase: SupabaseClient,
  userId: string
): Promise<PendingDirective[]> {
  const { data, error } = await supabase
    .from("work_directive_recipients")
    .select(
      "id, directive_id, created_at, work_directives(kind, title, body, priority, due_date, project:projects(id, name, color), profiles(full_name))"
    )
    .eq("user_id", userId)
    .eq("state", "미확인")
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as unknown as PendingDirectiveRow[];
  return rows
    .filter((row) => row.work_directives !== null)
    .map((row) => ({
      recipient_id: row.id,
      directive_id: row.directive_id,
      kind: row.work_directives!.kind,
      title: row.work_directives!.title,
      body: row.work_directives!.body,
      priority: row.work_directives!.priority,
      due_date: row.work_directives!.due_date,
      project: row.work_directives!.project,
      sender_name: row.work_directives!.profiles?.full_name ?? "",
      created_at: row.created_at,
    }))
    .sort((a, b) => {
      // 빠른 경로와 같은 정렬: 지시 먼저, 그다음 오래된 순
      if (a.kind !== b.kind) return a.kind === "지시" ? -1 : 1;
      return a.created_at.localeCompare(b.created_at);
    });
}

/** 표의 이름 옆 배지용 — 사용자별 미확인 건수 */
async function getDirectivePendingCounts(
  supabase: SupabaseClient
): Promise<DirectivePendingCount[]> {
  const { data, error } = await supabase
    .from("work_directive_recipients")
    .select("user_id")
    .eq("state", "미확인");

  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { user_id: string }[]) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }
  return Array.from(counts, ([user_id, count]) => ({ user_id, count })).sort((a, b) =>
    a.user_id.localeCompare(b.user_id)
  );
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

  const [
    todayRecord,
    weekRecords,
    taskSummary,
    todaySchedules,
    todayAttendanceStatuses,
    pendingDirectives,
    directivePendingCounts,
  ] = await Promise.all([
    getTodayRecord(supabase, userId),
    getWeekRecords(supabase, userId, weekStart, weekEnd),
    getDashboardTaskSummaryFallback(supabase, taskSummaryWindow),
    getTodaySchedules(supabase, today),
    getTodayAttendanceStatuses(supabase),
    getPendingDirectives(supabase, userId),
    getDirectivePendingCounts(supabase),
  ]);

  const snapshotData = buildDashboardDataFromSnapshot({
    todayRecord,
    weekRecords,
    taskSummary,
    todayAttendanceStatuses,
    schedules: todaySchedules,
    pendingDirectives,
    directivePendingCounts,
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
