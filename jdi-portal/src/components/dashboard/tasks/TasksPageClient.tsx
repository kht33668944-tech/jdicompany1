"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass, Plus, Bell } from "phosphor-react";
import type { Profile } from "@/lib/attendance/types";
import type { TaskWithDetails, TaskViewId, TaskFilterState } from "@/lib/tasks/types";
import { TASK_VIEWS, DEFAULT_FILTER_STATE } from "@/lib/tasks/constants";
import { filterTasks, sortTasks, groupTasks, computeSummary, buildTaskTree } from "@/lib/tasks/utils";
import TaskSummaryPanel from "./TaskSummaryPanel";
import TaskFilters from "./TaskFilters";
import ListView from "./views/ListView";
import CalendarView from "./views/CalendarView";
import TimelineView from "./views/TimelineView";
import TaskCreateModal from "./TaskCreateModal";

interface Props {
  allTasks: TaskWithDetails[];
  profiles: Profile[];
  userId: string;
}

const VIEW_STORAGE_KEY = "tasks-active-view";
const FILTER_STORAGE_KEY = "tasks-filters";

function getInitialView(): TaskViewId {
  if (typeof window === "undefined") return "list";
  return (window.localStorage.getItem(VIEW_STORAGE_KEY) as TaskViewId | null) ?? "list";
}

function getInitialFilters(): TaskFilterState {
  if (typeof window === "undefined") return DEFAULT_FILTER_STATE;
  try {
    const saved = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (saved) return { ...DEFAULT_FILTER_STATE, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_FILTER_STATE;
}

export default function TasksPageClient({ allTasks, profiles, userId }: Props) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<TaskViewId>(getInitialView);
  const [filters, setFilters] = useState<TaskFilterState>(getInitialFilters);
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
