"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarBlank, CheckCircle, ClockCounterClockwise, Plus } from "phosphor-react";
import type { Profile } from "@/lib/attendance/types";
import type { TaskWithDetails } from "@/lib/tasks/types";
import { formatDueDate, sortTasks } from "@/lib/tasks/utils";
import { TASK_STATUS_CONFIG } from "@/lib/tasks/constants";
import { toDateString, toDateStringFromTimestamp } from "@/lib/utils/date";
import { getTasksWithDetails } from "@/lib/tasks/queries";
import { cacheTasks } from "@/lib/tasks/tasksCache";
import { createClient } from "@/lib/supabase/client";
import TaskCreateModal from "./TaskCreateModal";
import TaskDetailPanel from "./TaskDetailPanel";
import UserAvatar from "@/components/shared/UserAvatar";

interface Props {
  profiles: Profile[];
  userId: string;
  initialTasks: TaskWithDetails[];
}

function isTodayTask(task: TaskWithDetails, today: string): boolean {
  if (task.status === "완료") return false;
  if (task.due_date && task.due_date <= today) return true;
  if (task.start_date && task.start_date <= today) return true;
  return toDateStringFromTimestamp(task.created_at) === today;
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

export default function TasksPageClient({ profiles, userId, initialTasks }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [allTasks, setAllTasks] = useState<TaskWithDetails[]>(initialTasks);

  const refreshTasks = useCallback(async () => {
    try {
      const supabase = createClient();
      const fresh = await getTasksWithDetails(supabase);
      setAllTasks(fresh);
      void cacheTasks(fresh);
    } catch (err) {
      console.warn("[TasksPageClient] refreshTasks failed:", err);
    }
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => void refreshTasks());
    return () => cancelAnimationFrame(id);
  }, [refreshTasks]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const detail = params.get("detail");
      if (detail) setDetailTaskId(detail);
      if (params.get("new") === "1") {
        setShowCreate(true);
        params.delete("new");
        const qs = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const setDetailInUrl = useCallback((id: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (id) params.set("detail", id);
    else params.delete("detail");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, []);

  const prevDetailRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevDetailRef.current && !detailTaskId) {
      requestAnimationFrame(() => void refreshTasks());
    }
    prevDetailRef.current = detailTaskId;
  }, [detailTaskId, refreshTasks]);

  const personalTasks = useMemo(
    () => allTasks.filter((task) => task.assignees.some((assignee) => assignee.user_id === userId)),
    [allTasks, userId]
  );
  const personalOpenTasks = useMemo(
    () => sortTasks(personalTasks.filter((task) => task.status !== "완료"), "due_date"),
    [personalTasks]
  );

  const today = toDateString();
  const todayFocusTasks = useMemo(
    () => personalOpenTasks.filter((task) => isTodayTask(task, today)),
    [personalOpenTasks, today]
  );
  const pendingCount = personalOpenTasks.filter((task) => task.status === "대기").length;
  const progressCount = personalOpenTasks.filter((task) => task.status === "진행중").length;
  const completedCount = personalTasks.filter((task) => task.status === "완료").length;

  const handleTaskClick = useCallback((taskId: string) => {
    setDetailTaskId(taskId);
    setDetailInUrl(taskId);
  }, [setDetailInUrl]);

  const handleClosePanel = useCallback(() => {
    setDetailTaskId(null);
    setDetailInUrl(null);
  }, [setDetailInUrl]);

  const initialTask = useMemo(
    () => (detailTaskId ? allTasks.find((task) => task.id === detailTaskId) ?? null : null),
    [detailTaskId, allTasks]
  );

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400">내 진행 업무</p>
          <p className="mt-2 text-2xl font-bold text-slate-800">{personalOpenTasks.length}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <ClockCounterClockwise size={14} />
            대기
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-800">{pendingCount}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500">
            <CalendarBlank size={14} />
            진행중
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600">{progressCount}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-500">
            <CheckCircle size={14} />
            완료
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{completedCount}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h1 className="text-lg font-bold text-slate-800">오늘 할 일</h1>
            <p className="mt-1 text-xs text-slate-400">마감일 기준으로 오늘 처리할 업무를 보여줍니다.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-500"
          >
            <Plus size={14} weight="bold" />
            할 일
          </button>
        </div>

        {todayFocusTasks.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <CheckCircle size={28} weight="fill" className="mx-auto text-emerald-400" />
            <p className="mt-3 text-sm font-semibold text-slate-600">오늘 표시할 업무가 없습니다</p>
            <p className="mt-1 text-xs text-slate-400">새 업무를 추가하면 이 목록에 바로 표시됩니다.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {todayFocusTasks.map((task) => {
              const statusConfig = TASK_STATUS_CONFIG[task.status];
              const due = formatDueDate(task.due_date, task.status);
              const mainAssignee = task.assignees[0] ?? profiles.find((profile) => profile.id === userId);

              return (
                <button
                  key={task.id}
                  onClick={() => handleTaskClick(task.id)}
                  className="grid w-full grid-cols-1 gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 lg:grid-cols-[minmax(0,1fr)_120px_120px]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusConfig.dot}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">{task.title}</p>
                      {task.description && (
                        <p className="mt-1 truncate text-xs text-slate-400">{task.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 lg:justify-center">
                    {mainAssignee && (
                      <>
                        <UserAvatar name={mainAssignee.full_name} avatarUrl={mainAssignee.avatar_url} size="sm" />
                        <span className="truncate text-xs font-semibold text-slate-500 lg:hidden">
                          {mainAssignee.full_name}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 lg:justify-end">
                    <span className={`rounded-lg px-2 py-1 text-[11px] font-bold ${statusConfig.bg} ${statusConfig.text}`}>
                      {task.status}
                    </span>
                    <span className={`text-xs font-bold ${due.className}`}>
                      {formatDueWithWeekday(task.due_date, due.text, today)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {showCreate && (
        <TaskCreateModal
          userId={userId}
          profiles={profiles}
          onClose={() => setShowCreate(false)}
          onCreated={refreshTasks}
        />
      )}

      <TaskDetailPanel
        profiles={profiles}
        userId={userId}
        taskId={detailTaskId}
        initialTask={initialTask}
        onClose={handleClosePanel}
      />
    </div>
  );
}
