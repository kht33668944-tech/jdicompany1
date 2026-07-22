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
import { toDashboardTaskPerson } from "@/lib/dashboard/dashboard-task-summary";
import type { TaskHistoryCursor, TaskHistoryFilters } from "@/lib/tasks/queries";
import {
  formatDueDate,
  getTaskRecordDate,
  isTaskCompletedOn,
  sortTasks,
} from "@/lib/tasks/utils";
import { TASK_STATUS_CONFIG } from "@/lib/tasks/constants";
import { addDays, formatDateFull, toDateString } from "@/lib/utils/date";
import { getInitialTasksWithDetails, getTaskHistoryWithDetails } from "@/lib/tasks/queries";
import { cacheTasks } from "@/lib/tasks/tasksCache";
import { createClient } from "@/lib/supabase/client";
import TaskCreateModal from "./TaskCreateModal";
import TaskDetailPanel from "./TaskDetailPanel";
import UserAvatar from "@/components/shared/UserAvatar";
import Select from "@/components/shared/Select";
import { useProjects } from "@/lib/projects/useProjects";

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
  const [historyTasks, setHistoryTasks] = useState<TaskWithDetails[]>([]);
  const [historyCursor, setHistoryCursor] = useState<TaskHistoryCursor | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [employeeId, setEmployeeId] = useState(userId);
  // 할 일 기록 기본값을 '오늘'로 둔다(전체 날짜는 불러올 범위가 넓어 느림).
  const [historyDate, setHistoryDate] = useState(() => toDateString());
  const [historyStatus, setHistoryStatus] = useState<HistoryStatusFilter>("all");
  const [historyProject, setHistoryProject] = useState("");
  const { activeProjects } = useProjects();
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const historyGenerationRef = useRef(0);
  const dashboardTaskProfiles = useMemo(
    () => profiles.map(toDashboardTaskPerson),
    [profiles]
  );

  const historyFilters = useMemo<TaskHistoryFilters>(() => ({
    query: searchQuery.trim() || undefined,
    assigneeId: employeeId === "all" ? undefined : employeeId,
    status: historyStatus === "all" ? undefined : historyStatus,
    date: historyDate || undefined,
    projectId: historyProject || undefined,
  }), [employeeId, historyDate, historyProject, historyStatus, searchQuery]);
  const historyFiltersRef = useRef(historyFilters);
  historyFiltersRef.current = historyFilters;

  const requestHistoryPage = useCallback(async (
    filters: TaskHistoryFilters,
    cursor: TaskHistoryCursor | null,
    generation: number,
    append: boolean
  ) => {
    try {
      const supabase = createClient();
      const page = await getTaskHistoryWithDetails(supabase, filters, cursor);
      if (generation !== historyGenerationRef.current) return;

      setHistoryTasks((current) => append ? [...current, ...page.tasks] : page.tasks);
      setHistoryCursor(page.nextCursor);
    } catch (err) {
      if (generation === historyGenerationRef.current) {
        console.warn("[TasksPageClient] history load failed:", err);
      }
    } finally {
      if (generation === historyGenerationRef.current) setHistoryLoading(false);
    }
  }, []);

  const refreshTasks = useCallback(() => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const refresh = (async () => {
      try {
        const supabase = createClient();
        const fresh = await getInitialTasksWithDetails(supabase);
        setAllTasks(fresh);
        void cacheTasks(fresh);
      } catch (err) {
        console.warn("[TasksPageClient] refreshTasks failed:", err);
      }
    })();

    refreshInFlightRef.current = refresh;
    void refresh.finally(() => {
      if (refreshInFlightRef.current === refresh) refreshInFlightRef.current = null;
    });
    return refresh;
  }, []);

  useEffect(() => {
    const generation = ++historyGenerationRef.current;
    setHistoryTasks([]);
    setHistoryCursor(null);
    setHistoryLoading(true);
    void requestHistoryPage(historyFilters, null, generation, false);
  }, [historyFilters, requestHistoryPage]);

  const loadMoreHistory = useCallback(() => {
    if (!historyCursor || historyLoading) return;
    const generation = historyGenerationRef.current;
    setHistoryLoading(true);
    void requestHistoryPage(historyFiltersRef.current, historyCursor, generation, true);
  }, [historyCursor, historyLoading, requestHistoryPage]);

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
    () => (detailTaskId
      ? allTasks.find((task) => task.id === detailTaskId)
        ?? historyTasks.find((task) => task.id === detailTaskId)
        ?? null
      : null),
    [allTasks, detailTaskId, historyTasks]
  );

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-4 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
        <div className="rounded-lg bg-white p-2.5 shadow-sm sm:p-4">
          <p className="truncate text-[11px] font-bold text-slate-400 sm:text-xs">
            <span className="sm:hidden">진행업무</span>
            <span className="hidden sm:inline">내 진행 업무</span>
          </p>
          <p className="mt-1 text-lg font-bold text-slate-800 sm:mt-2 sm:text-2xl">{personalOpenTasks.length}</p>
        </div>
        <div className="rounded-lg bg-white p-2.5 shadow-sm sm:p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 sm:text-xs">
            <ClockCounterClockwise size={14} className="hidden sm:block" />
            대기
          </div>
          <p className="mt-1 text-lg font-bold text-slate-800 sm:mt-2 sm:text-2xl">{pendingCount}</p>
        </div>
        <div className="rounded-lg bg-white p-2.5 shadow-sm sm:p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-500 sm:text-xs">
            <CalendarBlank size={14} className="hidden sm:block" />
            진행중
          </div>
          <p className="mt-1 text-lg font-bold text-amber-600 sm:mt-2 sm:text-2xl">{progressCount}</p>
        </div>
        <div className="rounded-lg bg-white p-2.5 shadow-sm sm:p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-500 sm:text-xs">
            <CheckCircle size={14} className="hidden sm:block" />
            완료
          </div>
          <p className="mt-1 text-lg font-bold text-emerald-600 sm:mt-2 sm:text-2xl">{completedCount}</p>
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
                  className="flex w-full flex-col gap-2 px-5 py-3.5 text-left transition-colors hover:bg-slate-50 lg:flex-row lg:items-center lg:gap-4 lg:py-4"
                >
                  {/* 제목 줄 (PC에선 왼쪽 flex-1) */}
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusConfig.dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {task.project && (
                          <span className="inline-flex max-w-24 shrink-0 items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: task.project.color }} aria-hidden="true" />
                            <span className="truncate">{task.project.name}</span>
                          </span>
                        )}
                        <p className="min-w-0 truncate text-sm font-bold text-slate-800">{task.title}</p>
                      </div>
                      {task.description && (
                        <p className="mt-1 hidden truncate text-xs text-slate-400 lg:block">{task.description}</p>
                      )}
                    </div>
                    {/* 모바일 전용: 제목 오른쪽 상태 뱃지 */}
                    <span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold lg:hidden ${statusConfig.bg} ${statusConfig.text}`}>
                      {task.status}
                    </span>
                  </div>

                  {/* 메타 줄 (모바일: 제목 아래 옅게 / PC: 오른쪽 인라인) */}
                  <div className="flex shrink-0 items-center gap-2 pl-[22px] text-xs lg:gap-3 lg:pl-0">
                    {mainAssignee && (
                      <>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <UserAvatar name={mainAssignee.full_name} avatarUrl={mainAssignee.avatar_url} size="sm" />
                          <span className="truncate font-semibold text-slate-500">{mainAssignee.full_name}</span>
                        </div>
                        <span aria-hidden="true" className="text-slate-300 lg:hidden">·</span>
                      </>
                    )}
                    {/* PC 전용: 상태 뱃지 */}
                    <span className={`hidden shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold lg:inline-flex ${statusConfig.bg} ${statusConfig.text}`}>
                      {task.status}
                    </span>
                    <span className={`shrink-0 font-bold ${due.className}`}>
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

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_170px_170px]">
            <Select
              value={employeeId}
              onChange={(v) => setEmployeeId(v)}
              ariaLabel="담당 직원 필터"
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              options={[
                { value: userId, label: "내 업무" },
                { value: "all", label: "전체 직원" },
                ...profiles
                  .filter((profile) => profile.id !== userId)
                  .map((profile) => ({ value: profile.id, label: profile.full_name })),
              ]}
            />
            <Select
              value={historyStatus}
              onChange={(v) => setHistoryStatus(v as HistoryStatusFilter)}
              ariaLabel="업무 상태 필터"
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              options={[
                { value: "all", label: "전체 상태" },
                { value: "대기", label: "대기", dotClass: TASK_STATUS_CONFIG["대기"].dot },
                { value: "진행중", label: "진행중", dotClass: TASK_STATUS_CONFIG["진행중"].dot },
                { value: "완료", label: "완료", dotClass: TASK_STATUS_CONFIG["완료"].dot },
              ]}
            />
            <Select
              value={historyProject}
              onChange={(v) => setHistoryProject(v)}
              ariaLabel="프로젝트 필터"
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              options={[
                { value: "", label: "전체 프로젝트" },
                ...activeProjects.map((project) => ({ value: project.id, label: project.name })),
                { value: "none", label: "미분류" },
              ]}
            />
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

        {historyLoading && historyGroups.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-semibold text-slate-600">업무 기록을 불러오는 중입니다</p>
          </div>
        ) : historyGroups.length === 0 ? (
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
                          <div className="flex min-w-0 items-center gap-1.5">
                            {task.project && (
                              <span className="inline-flex max-w-24 shrink-0 items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: task.project.color }} aria-hidden="true" />
                                <span className="truncate">{task.project.name}</span>
                              </span>
                            )}
                            <p className="min-w-0 truncate text-sm font-bold text-slate-800">{task.title}</p>
                          </div>
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
        {historyCursor && (
          <div className="border-t border-slate-100 px-5 py-3 text-center">
            <button
              type="button"
              onClick={loadMoreHistory}
              disabled={historyLoading}
              className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {historyLoading ? '불러오는 중' : '더 불러오기'}
            </button>
          </div>
        )}
      </section>

      {showCreate && (
        <TaskCreateModal
          userId={userId}
          profiles={dashboardTaskProfiles}
          onClose={() => setShowCreate(false)}
          onCreated={refreshTasks}
        />
      )}

      <TaskDetailPanel
        profiles={dashboardTaskProfiles}
        userId={userId}
        taskId={detailTaskId}
        initialTask={initialTask}
        onClose={handleClosePanel}
        onTaskMutated={refreshTasks}
      />
    </div>
  );
}
