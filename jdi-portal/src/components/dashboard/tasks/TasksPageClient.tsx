"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarBlank,
  CheckCircle,
  ClockCounterClockwise,
  MagnifyingGlass,
  Plus,
  X,
} from "phosphor-react";
import type { Profile } from "@/lib/attendance/types";
import type { TaskStatus, TaskWithDetails } from "@/lib/tasks/types";
import {
  formatDueDate,
  getTaskRecordDate,
  isTaskCompletedOn,
  sortTasks,
} from "@/lib/tasks/utils";
import { TASK_STATUS_CONFIG } from "@/lib/tasks/constants";
import { addDays, formatDateFull, toDateString } from "@/lib/utils/date";
import { getTaskHistoryWithDetails } from "@/lib/tasks/queries";
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
  if (task.status === "완료") return isTaskCompletedOn(task, today);
  if (task.due_date && task.due_date <= today) return true;
  if (task.start_date && task.start_date <= today) return true;
  return !task.due_date && !task.start_date;
}

type HistoryStatusFilter = "all" | TaskStatus;

function matchesTaskQuery(task: TaskWithDetails, query: string): boolean {
  if (!query) return true;
  const searchable = [
    task.title,
    task.description,
    task.category,
    task.creator_profile.full_name,
    ...task.assignees.map((assignee) => assignee.full_name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ko-KR");
  return searchable.includes(query.toLocaleLowerCase("ko-KR"));
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
  const [searchQuery, setSearchQuery] = useState("");
  const [employeeId, setEmployeeId] = useState(userId);
  const [historyDate, setHistoryDate] = useState("");
  const [historyStatus, setHistoryStatus] = useState<HistoryStatusFilter>("all");

  const refreshTasks = useCallback(async () => {
    try {
      const supabase = createClient();
      const fresh = await getTaskHistoryWithDetails(supabase);
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
    () => sortTasks(personalTasks.filter((task) => isTodayTask(task, today)), "due_date"),
    [personalTasks, today]
  );
  const pendingCount = personalOpenTasks.filter((task) => task.status === "대기").length;
  const progressCount = personalOpenTasks.filter((task) => task.status === "진행중").length;
  const completedCount = personalTasks.filter((task) => task.status === "완료").length;
  const yesterday = addDays(today, -1);
  const historyTasks = useMemo(() => {
    const trimmedQuery = searchQuery.trim();
    return [...allTasks]
      .filter((task) => employeeId === "all" || task.assignees.some((assignee) => assignee.user_id === employeeId))
      .filter((task) => historyStatus === "all" || task.status === historyStatus)
      .filter((task) => !historyDate || getTaskRecordDate(task) === historyDate)
      .filter((task) => matchesTaskQuery(task, trimmedQuery))
      .sort((a, b) => {
        const dateDiff = getTaskRecordDate(b).localeCompare(getTaskRecordDate(a));
        return dateDiff || b.updated_at.localeCompare(a.updated_at);
      });
  }, [allTasks, employeeId, historyDate, historyStatus, searchQuery]);

  const historyGroups = useMemo(() => {
    const groups = new Map<string, TaskWithDetails[]>();
    for (const task of historyTasks) {
      const date = getTaskRecordDate(task);
      groups.set(date, [...(groups.get(date) ?? []), task]);
    }
    return [...groups.entries()];
  }, [historyTasks]);

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

      <section className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-800">할 일 기록</h2>
              <p className="mt-1 text-xs text-slate-400">
                완료된 업무를 포함해 과거 기록을 검색하고 직원별로 확인합니다.
              </p>
            </div>
            <p className="text-xs font-bold text-slate-400">검색 결과 {historyTasks.length}건</p>
          </div>

          <label className="relative mt-4 block">
            <span className="sr-only">할 일 기록 검색</span>
            <MagnifyingGlass
              size={17}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="제목, 설명, 분류, 직원 검색"
              className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-10 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="검색어 지우기"
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={15} weight="bold" aria-hidden="true" />
              </button>
            )}
          </label>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px]">
            <select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              aria-label="담당 직원 필터"
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              <option value={userId}>내 업무</option>
              <option value="all">전체 직원</option>
              {profiles.filter((profile) => profile.id !== userId).map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.full_name}</option>
              ))}
            </select>
            <select
              value={historyStatus}
              onChange={(event) => setHistoryStatus(event.target.value as HistoryStatusFilter)}
              aria-label="업무 상태 필터"
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="all">전체 상태</option>
              <option value="대기">대기</option>
              <option value="진행중">진행중</option>
              <option value="완료">완료</option>
            </select>
          </div>

          <div className="mt-2 flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="업무 날짜 필터">
            {[
              { label: "전체 날짜", value: "" },
              { label: "오늘", value: today },
              { label: "어제", value: yesterday },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setHistoryDate(option.value)}
                className={`h-9 rounded-md px-3 text-xs font-bold transition-colors ${
                  historyDate === option.value
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {option.label}
              </button>
            ))}
            <input
              type="date"
              value={historyDate}
              onChange={(event) => setHistoryDate(event.target.value)}
              aria-label="날짜 직접 선택"
              className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        {historyGroups.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <MagnifyingGlass size={26} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-600">조건에 맞는 업무가 없습니다</p>
            <p className="mt-1 text-xs text-slate-400">검색어나 직원, 날짜 필터를 변경해 보세요.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {historyGroups.map(([date, tasks]) => (
              <section key={date} aria-labelledby={`task-history-${date}`}>
                <div className="bg-slate-50 px-5 py-2.5">
                  <h3 id={`task-history-${date}`} className="text-xs font-bold text-slate-500">
                    {formatDateFull(date)}
                  </h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {tasks.map((task) => {
                    const statusConfig = TASK_STATUS_CONFIG[task.status];
                    const owner = task.assignees[0];
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => handleTaskClick(task.id)}
                        className="grid w-full gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">{task.title}</p>
                          {task.description && (
                            <p className="mt-1 truncate text-xs text-slate-400">{task.description}</p>
                          )}
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                          {owner && <UserAvatar name={owner.full_name} avatarUrl={owner.avatar_url} size="sm" />}
                          <span className="truncate text-xs font-semibold text-slate-500">
                            {owner?.full_name ?? "미배정"}
                            {task.assignees.length > 1 ? ` 외 ${task.assignees.length - 1}명` : ""}
                          </span>
                        </div>
                        <span className={`w-fit rounded-lg px-2 py-1 text-[11px] font-bold ${statusConfig.bg} ${statusConfig.text}`}>
                          {task.status}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
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
