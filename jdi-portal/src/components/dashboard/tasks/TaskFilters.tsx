"use client";

import { FunnelSimple, Plus } from "phosphor-react";
import { CATEGORIES, TASK_PRIORITIES } from "@/lib/tasks/constants";
import type { Profile } from "@/lib/attendance/types";
import type { TaskPriority } from "@/lib/tasks/types";

interface TaskFiltersProps {
  profiles: Profile[];
  filterAssignee: string | null;
  filterCategory: string | null;
  filterPriority: TaskPriority | null;
  onFilterAssignee: (id: string | null) => void;
  onFilterCategory: (cat: string | null) => void;
  onFilterPriority: (p: TaskPriority | null) => void;
  onCreateClick: () => void;
}

export default function TaskFilters({
  profiles,
  filterAssignee,
  filterCategory,
  filterPriority,
  onFilterAssignee,
  onFilterCategory,
  onFilterPriority,
  onCreateClick,
}: TaskFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FunnelSimple size={16} className="text-slate-400" />

      <select
        value={filterAssignee ?? ""}
        onChange={(e) => onFilterAssignee(e.target.value || null)}
        className="glass-input px-3 py-1.5 rounded-lg text-xs outline-none"
      >
        <option value="">담당자 전체</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>{p.full_name}</option>
        ))}
      </select>

      <select
        value={filterCategory ?? ""}
        onChange={(e) => onFilterCategory(e.target.value || null)}
        className="glass-input px-3 py-1.5 rounded-lg text-xs outline-none"
      >
        <option value="">카테고리 전체</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <select
        value={filterPriority ?? ""}
        onChange={(e) => onFilterPriority((e.target.value as TaskPriority) || null)}
        className="glass-input px-3 py-1.5 rounded-lg text-xs outline-none"
      >
        <option value="">우선순위 전체</option>
        {TASK_PRIORITIES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <button
        onClick={onCreateClick}
        className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-md shadow-brand-500/20 transition-all duration-200"
      >
        <Plus size={16} weight="bold" />
        할일 추가
      </button>
    </div>
  );
}
