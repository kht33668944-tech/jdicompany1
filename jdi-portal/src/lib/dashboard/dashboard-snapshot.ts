import type { AttendanceRecord, Profile } from "../attendance/types";
import type { ScheduleWithProfile } from "../schedule/types";
import type { TaskWithDetails } from "../tasks/types";

export interface DashboardSnapshot {
  todayRecord: AttendanceRecord | null;
  weekRecords: AttendanceRecord[];
  tasks: TaskWithDetails[];
  profiles: Profile[];
  todayAttendanceRecords: AttendanceRecord[];
  schedules: ScheduleWithProfile[];
}

export interface DashboardSnapshotContext {
  userId: string;
  userName: string;
  canViewCompanyWork: boolean;
  weekStart: string;
  now: Date;
  completedTaskStatus: string;
}

export interface DashboardSnapshotData {
  todayRecord: AttendanceRecord | null;
  weeklyMinutes: number;
  weekdayWorked: boolean[];
  myTasks: TaskWithDetails[];
  allTasksForUser: TaskWithDetails[];
  allTasks: TaskWithDetails[];
  allProfiles: Profile[];
  todayAttendanceRecords: AttendanceRecord[];
  todaySchedules: ScheduleWithProfile[];
  recentActivities: [];
  nextScheduleMinutes: number | null;
  userName: string;
  canViewCompanyWork: boolean;
}

function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function sortTasksByDueDate(tasks: TaskWithDetails[]): TaskWithDetails[] {
  return [...tasks].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });
}

export function buildDashboardDataFromSnapshot(
  snapshot: DashboardSnapshot,
  context: DashboardSnapshotContext
): DashboardSnapshotData {
  const allTasksForUser = snapshot.tasks.filter((task) =>
    task.assignees.some((assignee) => assignee.user_id === context.userId)
  );
  const myTasks = sortTasksByDueDate(
    allTasksForUser.filter((task) => task.status !== context.completedTaskStatus)
  );
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
    myTasks,
    allTasksForUser,
    allTasks: snapshot.tasks,
    allProfiles: snapshot.profiles,
    todayAttendanceRecords: snapshot.todayAttendanceRecords,
    todaySchedules: snapshot.schedules,
    recentActivities: [],
    nextScheduleMinutes,
    userName: context.userName,
    canViewCompanyWork: context.canViewCompanyWork,
  };
}
