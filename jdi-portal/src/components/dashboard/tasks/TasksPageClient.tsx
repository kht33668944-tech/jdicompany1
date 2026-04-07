"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass, Plus } from "phosphor-react";
import type { Profile } from "@/lib/attendance/types";
import type { TaskWithDetails, TaskViewId, TaskFilterState } from "@/lib/tasks/types";
import { TASK_VIEWS, DEFAULT_FILTER_STATE } from "@/lib/tasks/constants";
import { filterTasks, sortTasks, groupTasks, computeSummary, buildTaskTree } from "@/lib/tasks/utils";
import { getTasksWithDetails } from "@/lib/tasks/queries";
import { getCachedTasks, cacheTasks } from "@/lib/tasks/tasksCache";
import { createClient } from "@/lib/supabase/client";
import TaskSummaryPanel from "./TaskSummaryPanel";
import TaskFilters from "./TaskFilters";
import ListView from "./views/ListView";
import CalendarView from "./views/CalendarView";
import TimelineView from "./views/TimelineView";
import TaskCreateModal from "./TaskCreateModal";

interface Props {
  profiles: Profile[];
  userId: string;
  /** SSR 호출마다 새 값 — router.refresh() 후 client re-fetch 트리거 */
  refreshSignal: number;
}

const VIEW_STORAGE_KEY = "tasks-active-view";
const FILTER_STORAGE_KEY = "tasks-filters";

export default function TasksPageClient({ profiles, userId, refreshSignal }: Props) {
  const router = useRouter();
  // SSR/CSR hydration mismatch 방지 — 항상 기본값으로 시작 후 mount 시 localStorage 로드
  const [activeView, setActiveView] = useState<TaskViewId>("list");
  const [filters, setFilters] = useState<TaskFilterState>(DEFAULT_FILTER_STATE);
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // mount 후 localStorage 에서 사용자 설정 복원
  useEffect(() => {
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
  }, []);
  // 할일 데이터: SSR 없이 클라이언트가 직접 로딩
  // 1) mount 시 IndexedDB 캐시 즉시 표시 (체감 0ms, 두 번째 진입부터)
  // 2) 백그라운드 client fetch → 최신 데이터로 교체 + 캐시 갱신
  const [allTasks, setAllTasks] = useState<TaskWithDetails[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // 1) IndexedDB 즉시 표시
    void getCachedTasks().then((cached) => {
      if (cancelled || !cached || cached.length === 0) return;
      setAllTasks((prev) => (prev.length === 0 ? cached : prev));
    });

    // 2) 백그라운드 신선 fetch
    void (async () => {
      try {
        const supabase = createClient();
        const fresh = await getTasksWithDetails(supabase);
        if (cancelled) return;
        setAllTasks(fresh);
        void cacheTasks(fresh);
      } catch (err) {
        console.warn("[TasksPageClient] fetch failed:", err);
      } finally {
        if (!cancelled) setHasLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // mutation 후 router.refresh() 대용 — 클라이언트에서 직접 재조회
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

  // refreshSignal 변화 감지 → re-fetch
  // 첫 mount 는 위 useEffect 가 처리하므로 hasLoaded 로 가드
  useEffect(() => {
    if (!hasLoaded) return;
    void refreshTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, activeView);
  }, [activeView]);

  useEffect(() => {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

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

  const handleTaskClick = (taskId: string) => {
    router.push(`/dashboard/tasks/${taskId}`);
  };

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
        />
      )}
    </div>
  );
}
