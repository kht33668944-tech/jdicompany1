"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarBlank,
  CheckCircle,
  CheckSquare,
  Clock,
  Plus,
  ShareNetwork,
  SpinnerGap,
  Square,
  Trash,
} from "phosphor-react";
import { toast } from "sonner";
import type { TodayAttendanceStatus } from "@/lib/attendance/types";
import type { ScheduleWithProfile } from "@/lib/schedule/types";
import type { TaskStatus } from "@/lib/tasks/types";
import {
  compareDashboardTaskSummaries,
  getDashboardTaskSummaryWindow,
  type DashboardTaskPerson,
  type DashboardTaskSummary,
  type DashboardTaskSummaryResult,
} from "@/lib/dashboard/dashboard-task-summary";
import { TASK_STATUS_CONFIG } from "@/lib/tasks/constants";
import { formatDueDate } from "@/lib/tasks/utils";
import { deleteTask, updateTask } from "@/lib/tasks/actions";
import { formatTime } from "@/lib/utils/date";
import UserAvatar from "@/components/shared/UserAvatar";
import TaskCreateModal from "@/components/dashboard/tasks/TaskCreateModal";
import TaskDetailPanel from "@/components/dashboard/tasks/TaskDetailPanel";
import WorkTimelineCreateModal from "@/components/dashboard/work-timeline/WorkTimelineCreateModal";
import { getTaskTimelineShare } from "@/lib/work-timeline/actions";
import type { WorkTimelineTaskShareState } from "@/lib/work-timeline/types";

interface Props {
  userId: string;
  profiles: DashboardTaskPerson[];
  taskSummary: DashboardTaskSummaryResult;
  attendanceStatuses: TodayAttendanceStatus[];
  schedules: ScheduleWithProfile[];
  defaultAssigneeFilter: string;
}

type StatusFilter = "all" | TaskStatus;

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "대기", label: "대기" },
  { value: "진행중", label: "진행중" },
  { value: "완료", label: "완료" },
];


function hasCheckedIn(attendance: TodayAttendanceStatus | undefined): boolean {
  return attendance !== undefined && attendance.status !== "미출근";
}

function getAttendanceText(attendance: TodayAttendanceStatus | undefined): string {
  if (!hasCheckedIn(attendance)) return "미출근";
  if (attendance?.status === "퇴근") return "퇴근 완료";
  return "출근 완료";
}

function getAttendanceTone(attendance: TodayAttendanceStatus | undefined): string {
  if (!hasCheckedIn(attendance)) return "bg-slate-100 text-slate-500";
  if (attendance?.status === "퇴근") return "bg-emerald-50 text-emerald-700";
  return "bg-indigo-50 text-indigo-700";
}

function scheduleBelongsToProfile(schedule: ScheduleWithProfile, profileId: string): boolean {
  if (schedule.schedule_participants?.some((participant) => participant.user_id === profileId)) return true;
  return schedule.created_by === profileId;
}
export function canUpdateDashboardTask(
  task: DashboardTaskSummary,
  userId: string,
  userRole: DashboardTaskPerson["role"],
): boolean {
  return userRole === "admin"
    || task.created_by === userId
    || task.assignees.some((assignee) => assignee.user_id === userId);
}

export function canDeleteDashboardTask(
  task: DashboardTaskSummary,
  userId: string,
  userRole: DashboardTaskPerson["role"],
): boolean {
  return userRole === "admin" || task.created_by === userId;
}

export function isDashboardTaskDragDisabled(): true {
  return true;
}

function taskBelongsToProfile(task: DashboardTaskSummary, profileId: string): boolean {
  return task.assignees.some((assignee) => assignee.user_id === profileId);
}

function isOverdueDashboardTask(task: DashboardTaskSummary, today: string): boolean {
  return task.status !== "완료" && task.due_date !== null && task.due_date < today;
}

function getScheduleTimeText(schedule: ScheduleWithProfile): string {
  if (schedule.is_all_day) return "종일";
  return `${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}`;
}

function getNextTaskStatus(status: TaskStatus): TaskStatus {
  if (status === "대기") return "진행중";
  if (status === "진행중") return "완료";
  return "대기";
}

function formatDueWithWeekday(dueDate: string | null, fallbackText: string, today: string): string {
  if (!dueDate) return fallbackText;
  const [, month, day] = dueDate.split("-");
  const weekday = new Date(`${dueDate}T12:00:00+09:00`).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  });
  if (dueDate === today) return `오늘 (${weekday})`;
  return `${month}.${day} (${weekday})`;
}

function getTaskOwnerLabel(task: DashboardTaskSummary): string {
  if (task.assignees.length === 0) return "미배정";
  if (task.assignees.length === 1) return task.assignees[0].full_name;
  return `${task.assignees[0].full_name} 외 ${task.assignees.length - 1}명`;
}

function CompletedTaskTimelineAction({
  taskId,
  taskTitle,
  currentUserId,
}: {
  taskId: string;
  taskTitle: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [shareState, setShareState] = useState<WorkTimelineTaskShareState | null>(null);
  const [checking, setChecking] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const openShare = async () => {
    if (shareState?.existingEntryId) {
      router.push(`/dashboard/work-timeline/${shareState.existingEntryId}`);
      return;
    }
    if (shareState?.canShare && shareState.task) {
      setShowCreate(true);
      return;
    }

    setChecking(true);
    try {
      const nextState = await getTaskTimelineShare(taskId);
      setShareState(nextState);
      if (nextState.existingEntryId) {
        router.push(`/dashboard/work-timeline/${nextState.existingEntryId}`);
      } else if (nextState.canShare && nextState.task) {
        setShowCreate(true);
      } else {
        toast.error("이 업무는 타임라인에 공유할 수 없습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "공유 상태를 확인하지 못했습니다.");
    } finally {
      setChecking(false);
    }
  };

  const isShared = Boolean(shareState?.existingEntryId);

  return (
    <>
      <button
        type="button"
        onClick={openShare}
        disabled={checking}
        title={isShared ? "공유된 타임라인 업무 보기" : "타임라인에 공유"}
        aria-label={isShared ? `${taskTitle} 공유된 타임라인 업무 보기` : `${taskTitle} 타임라인에 공유`}
        className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait ${
          isShared
            ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
            : "text-slate-300 hover:bg-indigo-50 hover:text-indigo-600"
        }`}
      >
        {checking ? (
          <SpinnerGap size={17} className="animate-spin" aria-hidden="true" />
        ) : isShared ? (
          <CheckCircle size={17} weight="fill" aria-hidden="true" />
        ) : (
          <ShareNetwork size={17} weight="bold" aria-hidden="true" />
        )}
      </button>

      {showCreate && shareState?.task && (
        <WorkTimelineCreateModal
          open
          currentUserId={currentUserId}
          onClose={() => setShowCreate(false)}
          onCreated={(entryId) => {
            setShareState((current) => current ? {
              ...current,
              canShare: false,
              existingEntryId: entryId,
              reason: "already_shared",
            } : current);
            setShowCreate(false);
            router.refresh();
          }}
          initialTitle={shareState.task.title}
          initialDescription={shareState.task.description ?? ""}
          initialCompletedAt={shareState.task.completedAt}
          taskId={taskId}
        />
      )}
    </>
  );
}

export default function TodayWorkBoardWidget({
  userId,
  profiles,
  taskSummary,
  attendanceStatuses,
  schedules,
  defaultAssigneeFilter,
}: Props) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState(defaultAssigneeFilter);
  const [localTasks, setLocalTasks] = useState(taskSummary.tasks);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const currentUserRole = profiles.find((profile) => profile.id === userId)?.role ?? "employee";

  useEffect(() => {
    setLocalTasks(taskSummary.tasks);
  }, [taskSummary.tasks]);

  useEffect(() => {
    setAssigneeFilter((current) => {
      if (current === "all" || profiles.some((profile) => profile.id === current)) return current;
      return defaultAssigneeFilter === "all"
        || profiles.some((profile) => profile.id === defaultAssigneeFilter)
        ? defaultAssigneeFilter
        : "all";
    });
  }, [defaultAssigneeFilter, profiles]);

  const today = taskSummary.today;
  const approvedProfiles = profiles;
  const attendanceByUser = new Map(attendanceStatuses.map((attendance) => [attendance.user_id, attendance]));
  const todayBoardTasks = localTasks;
  const dashboardTaskWindow = useMemo(
    () => getDashboardTaskSummaryWindow(new Date(`${taskSummary.today}T12:00:00+09:00`)),
    [taskSummary.today],
  );
  const assigneeTasks = useMemo(
    () => assigneeFilter === "all"
      ? todayBoardTasks
      : todayBoardTasks.filter((task) => taskBelongsToProfile(task, assigneeFilter)),
    [assigneeFilter, todayBoardTasks],
  );
  const filteredTasks = useMemo(
    () => assigneeTasks.filter((task) => statusFilter === "all" || task.status === statusFilter),
    [assigneeTasks, statusFilter],
  );
  const selectedProfile = assigneeFilter === "all"
    ? null
    : approvedProfiles.find((profile) => profile.id === assigneeFilter);
  const taskGroups = useMemo<Array<{
    id: string;
    label: string;
    avatarUrl: string | null;
    tasks: DashboardTaskSummary[];
  }>>(() => {
    if (assigneeFilter !== "all") {
      if (!selectedProfile || filteredTasks.length === 0) return [];
      return [{
        id: selectedProfile.id,
        label: selectedProfile.full_name,
        avatarUrl: selectedProfile.avatar_url ?? null,
        tasks: filteredTasks,
      }];
    }

    const groups = approvedProfiles.flatMap((profile) => {
      const groupedTasks = filteredTasks.filter((task) => taskBelongsToProfile(task, profile.id));
      return groupedTasks.length === 0 ? [] : [{
        id: profile.id,
        label: profile.full_name,
        avatarUrl: profile.avatar_url ?? null,
        tasks: groupedTasks,
      }];
    });
    const unassignedTasks = filteredTasks.filter((task) => task.assignees.length === 0);
    return unassignedTasks.length === 0 ? groups : [
      ...groups,
      { id: "unassigned", label: "미배정", avatarUrl: null, tasks: unassignedTasks },
    ];
  }, [approvedProfiles, assigneeFilter, filteredTasks, selectedProfile]);

  const counts = {
    all: assigneeTasks.length,
    대기: assigneeTasks.filter((task) => task.status === "대기").length,
    진행중: assigneeTasks.filter((task) => task.status === "진행중").length,
    완료: assigneeTasks.filter((task) => task.status === "완료").length,
  };
  const overdueCount = assigneeTasks.filter((task) => isOverdueDashboardTask(task, today)).length;
  const checkedInCount = approvedProfiles.filter((profile) => hasCheckedIn(attendanceByUser.get(profile.id))).length;
  const unregisteredCount = approvedProfiles.filter((profile) => {
    const profileHasCheckedIn = hasCheckedIn(attendanceByUser.get(profile.id));
    const hasTodayTask = todayBoardTasks.some(
      (task) => task.status !== "완료" && taskBelongsToProfile(task, profile.id),
    );
    return profileHasCheckedIn && !hasTodayTask;
  }).length;
  const visibleSchedules = schedules.slice(0, 5);
  const taskSectionTitle = assigneeFilter === "all"
    ? "오늘 전체 할 일"
    : assigneeFilter === userId
      ? "오늘 내 할 일"
      : `${selectedProfile?.full_name ?? "직원"}님의 오늘 할 일`;

  const closeTaskDetail = () => {
    setDetailTaskId(null);
    router.refresh();
  };

  const cycleTaskStatus = (task: DashboardTaskSummary) => {
    if (
      pendingTaskIds.has(task.id)
      || !canUpdateDashboardTask(task, userId, currentUserRole)
    ) return;

    const nextStatus = getNextTaskStatus(task.status);
    setLocalTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              status: nextStatus,
              updated_at: new Date().toISOString(),
              completed_at: nextStatus === "완료" ? new Date().toISOString() : null,
            }
          : item,
      ),
    );
    setPendingTaskIds((prev) => new Set(prev).add(task.id));
    startTransition(async () => {
      try {
        await updateTask(task.id, { status: nextStatus });
        router.refresh();
      } catch (error) {
        setLocalTasks((current) => current.map((item) => item.id === task.id ? task : item));
        console.error("Failed to update task status", error);
      } finally {
        setPendingTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }
    });
  };

  const handleDeleteTask = (task: DashboardTaskSummary) => {
    if (
      pendingTaskIds.has(task.id)
      || !canDeleteDashboardTask(task, userId, currentUserRole)
    ) return;
    if (!window.confirm(`"${task.title}" 업무를 삭제할까요?`)) return;

    setLocalTasks((current) => current.filter((item) => item.id !== task.id));
    setPendingTaskIds((prev) => new Set(prev).add(task.id));
    startTransition(async () => {
      try {
        await deleteTask(task.id);
        router.refresh();
      } catch (error) {
        setLocalTasks((current) => {
          if (current.some((item) => item.id === task.id)) return current;
          return [...current, task].sort((left, right) =>
            compareDashboardTaskSummaries(left, right, dashboardTaskWindow),
          );
        });
        console.error("Failed to delete task", error);
      } finally {
        setPendingTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }
    });
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            오늘 업무 현황
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            출근, 오늘 할 일, 지연 업무만 한 화면에서 확인합니다.
          </p>
        </div>
        <p className="text-sm font-semibold text-slate-600">
          출근 {checkedInCount}/{approvedProfiles.length}명 · 업무 미등록 {unregisteredCount}명 · 지연 {overdueCount}건
        </p>
      </div>

      <section className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-bold text-slate-800">직원별 오늘 현황</h3>
        </div>

        {approvedProfiles.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">표시할 직원이 없습니다</div>
        ) : (
          <div className="divide-y divide-slate-100">
            <div className="hidden grid-cols-[minmax(180px,1.4fr)_110px_90px_90px_90px_minmax(120px,0.8fr)] gap-3 px-5 py-3 text-xs font-bold text-slate-400 lg:grid">
              <span>직원</span>
              <span>출근</span>
              <span>대기</span>
              <span>진행중</span>
              <span>완료</span>
              <span className="text-right">일정</span>
            </div>

            {approvedProfiles.map((profile) => {
              const attendance = attendanceByUser.get(profile.id);
              const profileTasks = todayBoardTasks.filter((task) => taskBelongsToProfile(task, profile.id));
              const profileSchedules = schedules.filter((schedule) => scheduleBelongsToProfile(schedule, profile.id));
              const pendingCount = profileTasks.filter((task) => task.status === "대기").length;
              const progressCount = profileTasks.filter((task) => task.status === "진행중").length;
              const doneCount = profileTasks.filter((task) => task.status === "완료").length;

              return (
                <div
                  key={profile.id}
                  className="grid grid-cols-2 gap-3 px-5 py-4 lg:grid-cols-[minmax(180px,1.4fr)_110px_90px_90px_90px_minmax(120px,0.8fr)] lg:items-center"
                >
                  <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
                    <UserAvatar name={profile.full_name} avatarUrl={profile.avatar_url} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">{profile.full_name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {profileTasks.length > 0 ? `오늘 할 일 ${doneCount}/${profileTasks.length}` : "오늘 등록된 업무 없음"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] font-bold text-slate-400 lg:hidden">출근</p>
                    <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${getAttendanceTone(attendance)}`}>
                      {getAttendanceText(attendance)}
                    </span>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-bold text-slate-400 lg:hidden">대기</p>
                    <p className="text-sm font-bold text-slate-700">{pendingCount}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-bold text-slate-400 lg:hidden">진행중</p>
                    <p className="text-sm font-bold text-amber-600">{progressCount}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-bold text-slate-400 lg:hidden">완료</p>
                    <p className="text-sm font-bold text-emerald-600">{doneCount}</p>
                  </div>
                  <div className="text-left lg:text-right">
                    <p className="mb-1 text-[11px] font-bold text-slate-400 lg:hidden">일정</p>
                    <p className="text-sm font-bold text-slate-800">{profileSchedules.length}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">{taskSectionTitle}</h3>
            <p className="mt-1 text-xs text-slate-400">체크로 상태를 변경하고, 업무를 눌러 상세 내용을 확인합니다.</p>
            {taskSummary.truncated && (
              <Link
                href="/dashboard/tasks"
                className="mt-2 inline-flex text-xs font-bold text-indigo-600 hover:text-indigo-500"
              >
                일부 업무만 표시 · 전체 업무 보기
              </Link>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value)}
              aria-label="직원별 오늘 할 일 필터"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="all">전체 직원</option>
              {approvedProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.id === userId ? `${profile.full_name} (나)` : profile.full_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500"
            >
              <Plus size={14} weight="bold" />
              내 할 일
            </button>
            {FILTERS.map((filter) => {
              const active = statusFilter === filter.value;
              const count = filter.value === "all" ? counts.all : counts[filter.value];
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  aria-pressed={active}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                    active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {filter.label} {count}
                </button>
              );
            })}
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Clock size={26} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-600">표시할 오늘 할 일이 없습니다</p>
            <p className="mt-1 text-xs text-slate-400">출근 후 오늘 할 일을 등록하면 이곳에 표시됩니다.</p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-500"
            >
              <Plus size={14} weight="bold" />
              내 할 일 추가
            </button>
          </div>
        ) : (
          <div className="max-h-[36rem] divide-y divide-slate-100 overflow-y-auto">
            {taskGroups.map((group) => {
              const doneCount = group.tasks.filter((task) => task.status === "완료").length;

              return (
                <div key={group.id} className="px-5 py-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <UserAvatar name={group.label} avatarUrl={group.avatarUrl} size="sm" />
                      <p className="truncate text-sm font-bold text-slate-800">{group.label}</p>
                    </div>
                    <p className="shrink-0 text-xs font-bold text-slate-400">
                      {doneCount}/{group.tasks.length} 완료
                    </p>
                  </div>
                  <div className="space-y-2">
                    {group.tasks.map((task) => {
                      const statusConfig = TASK_STATUS_CONFIG[task.status];
                      const due = formatDueDate(task.due_date, task.status);
                      const isDone = task.status === "완료";
                      const isTaskPending = pendingTaskIds.has(task.id);
                      const canUpdate = canUpdateDashboardTask(task, userId, currentUserRole);
                      const canDelete = canDeleteDashboardTask(task, userId, currentUserRole);
                      const canShareTimeline = isDone && (
                        task.created_by === userId || task.assignees.some((assignee) => assignee.user_id === userId)
                      );

                      return (
                        <div
                          key={task.id}
                          className={`grid ${canShareTimeline ? "grid-cols-[auto_minmax(0,1fr)_auto_auto]" : "grid-cols-[auto_minmax(0,1fr)_auto]"} gap-3 rounded-lg border border-slate-100 px-3 py-3 transition-colors ${
                            isDone ? "bg-slate-50" : "bg-white"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => cycleTaskStatus(task)}
                            disabled={isTaskPending || !canUpdate}
                            className="mt-0.5 text-slate-300 transition-colors hover:text-emerald-500 disabled:cursor-default disabled:hover:text-emerald-500"
                            aria-label={`${task.title} 상태 변경`}
                          >
                            {isDone ? (
                              <CheckSquare size={20} weight="fill" className="text-emerald-500" />
                            ) : task.status === "진행중" ? (
                              <CheckSquare size={20} weight="fill" className="text-amber-500" />
                            ) : (
                              <Square size={20} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailTaskId(task.id)}
                            disabled={isTaskPending}
                            className="min-w-0 rounded-md text-left outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-default"
                            aria-label={`${task.title} 상세 보기`}
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className={`truncate text-sm font-bold ${isDone ? "text-slate-400 line-through" : "text-slate-800"}`}>
                                {task.title}
                              </p>
                              <div className="flex shrink-0 items-center gap-4">
                                <span className={`rounded-lg px-2 py-1 text-[11px] font-bold ${statusConfig.bg} ${statusConfig.text}`}>
                                  {task.status}
                                </span>
                                <span className={`text-xs font-bold ${due.className}`}>
                                  {formatDueWithWeekday(task.due_date, due.text, today)}
                                </span>
                              </div>
                            </div>
                            {task.assignees.length > 1 && (
                              <p className="mt-1 truncate text-xs text-slate-400">{getTaskOwnerLabel(task)}</p>
                            )}
                          </button>
                          {canShareTimeline && (
                            <CompletedTaskTimelineAction
                              taskId={task.id}
                              taskTitle={task.title}
                              currentUserId={userId}
                            />
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTask(task)}
                              disabled={isTaskPending}
                              className="mt-0.5 text-slate-300 transition-colors hover:text-red-500 disabled:cursor-default disabled:opacity-40"
                              aria-label={`${task.title} 삭제`}
                            >
                              <Trash size={18} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-800">오늘 일정</h3>
            <p className="mt-1 text-xs text-slate-400">업무 흐름에 필요한 일정만 간단히 확인합니다.</p>
          </div>
        </div>

        {visibleSchedules.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">오늘 일정 없음</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleSchedules.map((schedule) => (
              <div key={schedule.id} className="grid grid-cols-1 gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                <div className="flex min-w-0 items-center gap-3">
                  <CalendarBlank size={18} className="shrink-0 text-indigo-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{schedule.title}</p>
                    <p className="mt-1 truncate text-xs text-slate-400">
                      {schedule.creator_profile.full_name}
                    </p>
                  </div>
                </div>
                <p className="text-xs font-bold text-slate-500 sm:text-right">{getScheduleTimeText(schedule)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {showCreate && (
        <TaskCreateModal
          userId={userId}
          profiles={profiles}
          initialDueDate={today}
          onClose={() => setShowCreate(false)}
          onCreated={() => router.refresh()}
        />
      )}

      <TaskDetailPanel
        profiles={profiles}
        userId={userId}
        taskId={detailTaskId}
        initialTask={null}
        onClose={closeTaskDetail}
      />
    </section>
  );
}
