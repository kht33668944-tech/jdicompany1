"use client";

import { useState, useRef, useEffect } from "react";
import {
  User,
  Tag,
  Funnel,
  CaretDown,
  StackSimple,
  SortAscending,
} from "phosphor-react";
import type { Profile } from "@/lib/attendance/types";
import type { TaskFilterState, TaskGroupBy, TaskSortBy, TaskStatus } from "@/lib/tasks/types";
import { CATEGORIES, TASK_STATUSES, GROUP_BY_OPTIONS, SORT_BY_OPTIONS } from "@/lib/tasks/constants";

interface Props {
  profiles: Profile[];
  filters: TaskFilterState;
  onFilterChange: (filters: TaskFilterState) => void;
}

function Dropdown({
  label,
  icon: Icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayLabel = value ? options.find((o) => o.value === value)?.label ?? label : label;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs md:text-sm whitespace-nowrap cursor-pointer transition-all ${
          value
            ? "bg-indigo-50 text-indigo-600 font-bold shadow-sm"
            : "bg-white text-slate-500 shadow-sm hover:bg-slate-50"
        }`}
      >
        <Icon size={16} />
        <span>{displayLabel}</span>
        <CaretDown size={12} />
      </button>
      {open && (
        <div className="absolute top-full mt-2 right-0 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50 min-w-[160px]">
          <button
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${
              !value ? "text-indigo-600 font-bold" : "text-slate-500"
            }`}
          >
            전체
          </button>
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${
                value === option.value ? "text-indigo-600 font-bold" : "text-slate-600"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TaskFilters({ profiles, filters, onFilterChange }: Props) {
  const update = (partial: Partial<TaskFilterState>) => {
    onFilterChange({ ...filters, ...partial });
  };

  return (
    <div className="flex items-center justify-end">
      <div className="flex items-center flex-wrap gap-2 md:gap-3">
        <Dropdown
          label="담당자"
          icon={User}
          value={filters.assignee}
          options={profiles.map((p) => ({ value: p.id, label: p.full_name }))}
          onChange={(v) => update({ assignee: v })}
        />
        <Dropdown
          label="카테고리"
          icon={Tag}
          value={filters.category}
          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          onChange={(v) => update({ category: v })}
        />
        <Dropdown
          label="상태"
          icon={Funnel}
          value={filters.status}
          options={TASK_STATUSES.map((s) => ({ value: s, label: s }))}
          onChange={(v) => update({ status: v as TaskStatus | null })}
        />

        <div className="w-px h-6 bg-slate-200 hidden md:block" />

        <Dropdown
          label={`그룹: ${GROUP_BY_OPTIONS[filters.groupBy]}`}
          icon={StackSimple}
          value={filters.groupBy}
          options={Object.entries(GROUP_BY_OPTIONS).map(([value, label]) => ({ value, label }))}
          onChange={(v) => update({ groupBy: (v as TaskGroupBy) ?? "status" })}
        />
        <Dropdown
          label={`정렬: ${SORT_BY_OPTIONS[filters.sortBy]}`}
          icon={SortAscending}
          value={filters.sortBy}
          options={Object.entries(SORT_BY_OPTIONS).map(([value, label]) => ({ value, label }))}
          onChange={(v) => update({ sortBy: (v as TaskSortBy) ?? "due_date" })}
        />
      </div>
    </div>
  );
}
