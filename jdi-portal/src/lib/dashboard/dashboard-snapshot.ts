import type { AttendanceRecord, TodayAttendanceStatus } from "../attendance/types";
import type { DirectivePendingCount, PendingDirective } from "../directives/types";
import type { ScheduleWithProfile } from "../schedule/types";
import type { DashboardTaskSummaryResult } from "./dashboard-task-summary";

export interface DashboardSnapshot {
  todayRecord: AttendanceRecord | null;
  weekRecords: AttendanceRecord[];
  taskSummary: DashboardTaskSummaryResult;
  todayAttendanceStatuses: TodayAttendanceStatus[];
  schedules: ScheduleWithProfile[];
  pendingDirectives: PendingDirective[];
  directivePendingCounts: DirectivePendingCount[];
}

export interface DashboardSnapshotContext {
  userName: string;
  canViewCompanyWork: boolean;
  weekStart: string;
  now: Date;
}

export interface DashboardSnapshotData {
  todayRecord: AttendanceRecord | null;
  weeklyMinutes: number;
  weekdayWorked: boolean[];
  taskSummary: DashboardTaskSummaryResult;
  todayAttendanceStatuses: TodayAttendanceStatus[];
  todaySchedules: ScheduleWithProfile[];
  recentActivities: unknown[];
  nextScheduleMinutes: number | null;
  userName: string;
  canViewCompanyWork: boolean;
  pendingDirectives: PendingDirective[];
  directivePendingCounts: DirectivePendingCount[];
}

function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function buildDashboardDataFromSnapshot(
  snapshot: DashboardSnapshot,
  context: DashboardSnapshotContext
): DashboardSnapshotData {
  const weeklyMinutes = snapshot.weekRecords.reduce(
    (total, record) => total + (record.total_minutes ?? 0),
    0
  );
  const weekdayWorked = Array.from({ length: 5 }, (_, index) => {
    const date = addDays(context.weekStart, index);
    return snapshot.weekRecords.some((record) => record.work_date === date);
  });

  let nextScheduleMinutes: number | null = null;
  for (const schedule of snapshot.schedules) {
    const start = new Date(schedule.start_time);
    if (start > context.now) {
      nextScheduleMinutes = Math.round((start.getTime() - context.now.getTime()) / 60_000);
      break;
    }
  }

  return {
    todayRecord: snapshot.todayRecord,
    weeklyMinutes,
    weekdayWorked,
    taskSummary: snapshot.taskSummary,
    todayAttendanceStatuses: snapshot.todayAttendanceStatuses,
    todaySchedules: snapshot.schedules,
    recentActivities: [],
    nextScheduleMinutes,
    userName: context.userName,
    canViewCompanyWork: context.canViewCompanyWork,
    // 업무지시 기능(103) 이전에 만들어진 스냅샷이 들어와도 화면이 깨지지 않도록 기본값을 둔다.
    pendingDirectives: snapshot.pendingDirectives ?? [],
    directivePendingCounts: snapshot.directivePendingCounts ?? [],
  };
}
