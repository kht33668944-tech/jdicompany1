import { toDateString, addDays } from "@/lib/utils/date";
import type {
  TaskWithDetails,
  TaskStatus,
  TaskPriority,
  TaskGroupBy,
  TaskSortBy,
  TaskFilterState,
  TaskSummary,
} from "./types";

export function calculateProgress(total: number, completed: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

export function isOverdue(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === "완료") return false;
  return dueDate < toDateString();
}

export function formatDueDate(dueDate: string | null, status: TaskStatus): { text: string; className: string } {
  if (!dueDate) return { text: "-", className: "text-slate-400" };

  const today = toDateString();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);

  if (status === "완료") {
    return { text: dueDate.slice(5).replace("-", "."), className: "text-slate-400" };
  }

  if (dueDate < yesterday) {
    const diff = Math.floor((new Date(today).getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24));
    return { text: `${diff}일 지연`, className: "text-red-500 font-bold" };
  }
  if (dueDate === yesterday) {
    return { text: "어제까지", className: "text-red-500 font-bold" };
  }
  if (dueDate === today) {
    return { text: "오늘 마감", className: "text-orange-500 font-bold" };
  }
  if (dueDate === tomorrow) {
    return { text: "내일 마감", className: "text-orange-400 font-medium" };
  }

  return { text: dueDate.slice(2).replace(/-/g, "."), className: "text-slate-500 font-medium" };
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  "긴급": 0,
  "높음": 1,
  "보통": 2,
  "낮음": 3,
};

const STATUS_ORDER: Record<TaskStatus, number> = {
  "진행중": 0,
  "대기": 1,
  "완료": 2,
};

export function sortTasks(tasks: TaskWithDetails[], sortBy: TaskSortBy): TaskWithDetails[] {
  return [...tasks].sort((a, b) => {
    switch (sortBy) {
      case "due_date": {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      }
      case "priority":
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      case "created_at":
        return b.created_at.localeCompare(a.created_at);
      case "updated_at":
        return b.updated_at.localeCompare(a.updated_at);
      default:
        return 0;
    }
  });
}

export function groupTasks(
  tasks: TaskWithDetails[],
  groupBy: TaskGroupBy
): { key: string; label: string; tasks: TaskWithDetails[] }[] {
  const groups = new Map<string, TaskWithDetails[]>();

  for (const task of tasks) {
    let key: string;
    switch (groupBy) {
      case "status":
        key = task.status;
        break;
      case "assignee":
        key = task.assignees.length > 0 ? task.assignees.map((a) => a.full_name).join(", ") : "미배정";
        break;
      case "category":
        key = task.category ?? "미분류";
        break;
      case "priority":
        key = task.priority;
        break;
      default:
        key = "기타";
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(task);
  }

  const entries = Array.from(groups.entries()).map(([key, tasks]) => ({
    key,
    label: key,
    tasks,
  }));

  if (groupBy === "status") {
    entries.sort((a, b) => STATUS_ORDER[a.key as TaskStatus] - STATUS_ORDER[b.key as TaskStatus]);
  } else if (groupBy === "priority") {
    entries.sort((a, b) => PRIORITY_ORDER[a.key as TaskPriority] - PRIORITY_ORDER[b.key as TaskPriority]);
  }

  return entries;
}

export function filterTasks(tasks: TaskWithDetails[], filters: TaskFilterState): TaskWithDetails[] {
  return tasks.filter((task) => {
    if (filters.assignee && !task.assignees.some((a) => a.user_id === filters.assignee)) return false;
    if (filters.category && task.category !== filters.category) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.status && task.status !== filters.status) return false;
    return true;
  });
}

export function computeSummary(tasks: TaskWithDetails[]): TaskSummary {
  const today = toDateString();
  const weekStart = addDays(today, -7);

  const by_status: Record<TaskStatus, number> = { "대기": 0, "진행중": 0, "완료": 0 };
  let overdue = 0;
  let completed_this_week = 0;

  for (const task of tasks) {
    by_status[task.status]++;
    if (isOverdue(task.due_date, task.status)) overdue++;
    if (task.status === "완료" && task.updated_at >= weekStart) completed_this_week++;
  }

  return {
    total: tasks.length,
    by_status,
    overdue,
    completed_this_week,
  };
}

export function buildTaskTree(tasks: TaskWithDetails[]): TaskWithDetails[] {
  const topLevel: TaskWithDetails[] = [];
  const childMap = new Map<string, TaskWithDetails[]>();

  for (const task of tasks) {
    if (task.parent_id) {
      if (!childMap.has(task.parent_id)) childMap.set(task.parent_id, []);
      childMap.get(task.parent_id)!.push(task);
    }
  }

  for (const task of tasks) {
    if (!task.parent_id) {
      topLevel.push({ ...task, children: childMap.get(task.id) ?? [] });
    }
  }

  return topLevel;
}
