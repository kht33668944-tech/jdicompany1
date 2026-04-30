"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass, Plus } from "phosphor-react";
import type { Profile } from "@/lib/attendance/types";
import type { TaskWithDetails, TaskViewId, TaskFilterState } from "@/lib/tasks/types";
import { TASK_VIEWS, DEFAULT_FILTER_STATE } from "@/lib/tasks/constants";
import { filterTasks, sortTasks, groupTasks, computeSummary, buildTaskTree } from "@/lib/tasks/utils";
import { getTasksWithDetails } from "@/lib/tasks/queries";
import { cacheTasks, getCachedTasks } from "@/lib/tasks/tasksCache";
import { createClient } from "@/lib/supabase/client";
import TaskSummaryPanel from "./TaskSummaryPanel";
import TaskFilters from "./TaskFilters";
import ListView from "./views/ListView";
import CalendarView from "./views/CalendarView";
import TimelineView from "./views/TimelineView";
import TaskCreateModal from "./TaskCreateModal";
import TaskDetailPanel from "./TaskDetailPanel";

interface Props {
  profiles: Profile[];
  userId: string;
  initialTasks: TaskWithDetails[];
}

const VIEW_STORAGE_KEY = "tasks-active-view";
const FILTER_STORAGE_KEY = "tasks-filters";

export default function TasksPageClient({ profiles, userId, initialTasks }: Props) {
  // SSR/CSR hydration mismatch 방지 — 항상 기본값으로 시작 후 mount 시 localStorage 로드
  const [activeView, setActiveView] = useState<TaskViewId>("list");
  const [filters, setFilters] = useState<TaskFilterState>(DEFAULT_FILTER_STATE);
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // 상세 패널은 Next 라우터 대신 로컬 상태 + history.replaceState 로 관리
  // → 서버 컴포넌트 재실행 없이 즉시 열림 (다른 페이지/탭 내비게이션엔 영향 없음)
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const [allTasks, setAllTasks] = useState<TaskWithDetails[]>(initialTasks);
  // fresh fetch 가 적용된 후 늦게 도착한 IDB 캐시가 빈 fresh 를 stale 로 덮어쓰는 race 차단
  const freshLoadedRef = useRef(initialTasks.length > 0);

  // mount 후 localStorage 에서 사용자 설정 복원 (hydration 이후 비동기 적용)
  useEffect(() => {
    requestAnimationFrame(() => {
      try {
        const savedView = window.localStorage.getItem(VIEW_STORAGE_KEY) as TaskViewId | null;
        if (savedView) setActiveView(savedView);
        const savedFilters = window.localStorage.getItem(FILTER_STORAGE_KEY);
        if (savedFilters) {
          setFilters({ ...DEFAULT_FILTER_STATE, ...JSON.parse(savedFilters) });
        }
      } catch {
        // 파싱 실패 무시 — 기본값 유지
      }
    });
  }, []);

  const refreshTasks = useCallback(async () => {
    try {
      const supabase = createClient();
      const fresh = await getTasksWithDetails(supabase);
      setAllTasks(fresh);
      freshLoadedRef.current = true;
      void cacheTasks(fresh);
    } catch (err) {
      console.warn("[TasksPageClient] refreshTasks failed:", err);
    }
  }, []);

  // 마운트 시: IDB 캐시 → 즉시 표시 → 백그라운드 네트워크 fetch
  useEffect(() => {
    let cancelled = false;
    // 1) IDB 캐시가 있으면 즉시 표시 (네트워크 대기 없이 화면 렌더)
    getCachedTasks().then((cached) => {
      if (cancelled || freshLoadedRef.current) return;
      if (cached && cached.length > 0) setAllTasks(cached);
    });
    // 2) 백그라운드에서 최신 데이터 fetch
    const id = requestAnimationFrame(() => void refreshTasks());
    return () => { cancelled = true; cancelAnimationFrame(id); };
  }, [refreshTasks]);

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, activeView);
  }, [activeView]);

  useEffect(() => {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  // 딥링크 대응: 초기 URL 의 ?detail=xxx 를 1회 동기화
  // rAF 로 지연 — hydration 후 비동기 적용 (cascading render 방지)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const d = params.get("detail");
      if (d) setDetailTaskId(d);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // URL ?detail= 동기화 (history API — 서버 내비게이션 없음)
  const setDetailInUrl = useCallback((id: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (id) params.set("detail", id);
    else params.delete("detail");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`
    );
  }, []);

  // 패널이 닫힐 때 목록 갱신
  const prevDetailRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevDetailRef.current && !detailTaskId) {
      requestAnimationFrame(() => void refreshTasks());
    }
    prevDetailRef.current = detailTaskId;
  }, [detailTaskId, refreshTasks]);

  const summary = useMemo(() => computeSummary(allTasks), [allTasks]);

  const processedTasks = useMemo(() => {
    let tasks = allTasks;
    // 검색 필터
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      tasks = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q) ||
          t.assignees.some((a) => a.full_name.toLowerCase().includes(q))
      );
    }
    const filtered = filterTasks(tasks, filters);
    const sorted = sortTasks(filtered, filters.sortBy);
    return sorted;
  }, [allTasks, filters, searchQuery]);

  const groupedTasks = useMemo(() => {
    const topLevel = processedTasks.filter((t) => !t.parent_id);
    return groupTasks(topLevel, filters.groupBy);
  }, [processedTasks, filters.groupBy]);

  // 서브태스크를 부모에 매핑
  const tasksWithChildren = useMemo(() => buildTaskTree(processedTasks), [processedTasks]);

  const handleTaskClick = useCallback((taskId: string) => {
    setDetailTaskId(taskId);
    setDetailInUrl(taskId);
  }, [setDetailInUrl]);

  const handleClosePanel = useCallback(() => {
    setDetailTaskId(null);
    setDetailInUrl(null);
  }, [setDetailInUrl]);

  // 클릭한 할일을 allTasks 에서 즉시 찾아 패널에 시드 → 제목/담당자/기간 즉시 표시
  const initialTask = useMemo(
    () => (detailTaskId ? allTasks.find((t) => t.id === detailTaskId) ?? null : null),
    [detailTaskId, allTasks]
  );

  return (
    <div className="space-y-8">
      {/* 검색 바 + 할일 추가 버튼 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center flex-1 sm:max-w-xl">
          <div className="relative w-full">
            <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="할일 검색..."
              className="w-full pl-12 pr-4 py-2.5 bg-white rounded-2xl border-none focus:ring-2 focus:ring-indigo-100 transition-all text-sm outline-none shadow-sm"
            />
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all w-full sm:w-auto"
          style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)" }}
        >
          <Plus size={16} weight="bold" />
          할일 추가
        </button>
      </div>

      <TaskSummaryPanel summary={summary} />

      {/* 뷰 탭 + 필터 */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="bg-white p-1 rounded-2xl shadow-sm flex gap-1">
            {(Object.keys(TASK_VIEWS) as TaskViewId[]).map((viewId) => {
              const view = TASK_VIEWS[viewId];
              const active = activeView === viewId;
              return (
                <button
                  key={viewId}
                  onClick={() => setActiveView(viewId)}
                  className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:bg-slate-50"
                  }`}
                >
                  {view.label}
                </button>
              );
            })}
          </div>
        </div>

        <TaskFilters
          profiles={profiles}
          filters={filters}
          onFilterChange={setFilters}
        />
      </div>

      {/* 뷰 렌더링 */}
      {activeView === "list" && (
        <ListView
          groupedTasks={groupedTasks}
          allTasks={tasksWithChildren}
          onTaskClick={handleTaskClick}
          profiles={profiles}
          userId={userId}
          onRefresh={refreshTasks}
        />
      )}
      {activeView === "calendar" && (
        <CalendarView
          tasks={processedTasks}
          onTaskClick={handleTaskClick}
        />
      )}
      {activeView === "timeline" && (
        <TimelineView
          tasks={processedTasks}
          onTaskClick={handleTaskClick}
        />
      )}

      {/* 생성 모달 */}
      {showCreate && (
        <TaskCreateModal
          userId={userId}
          profiles={profiles}
          onClose={() => setShowCreate(false)}
          onCreated={refreshTasks}
        />
      )}

      {/* 상세 패널 */}
      <TaskDetailPanel
        profiles={profiles}
        userId={userId}
        taskId={detailTaskId}
        initialTask={initialTask}
        onClose={handleClosePanel}
        onNavigate={handleTaskClick}
      />
    </div>
  );
}
