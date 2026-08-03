import { addDays, toDateString, toDateStringFromTimestamp } from "@/lib/utils/date";
import type {
  TaskSortBy,
  TaskStatus,
  TaskWithDetails,
} from "./types";

export function calculateProgress(total: number, completed: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

export function getTaskRecordDate(task: TaskWithDetails): string {
  if (task.status === "완료" && task.completed_at) {
    return toDateStringFromTimestamp(task.completed_at);
  }
  return task.due_date ?? toDateStringFromTimestamp(task.created_at);
}

export function isTaskCompletedOn(task: TaskWithDetails, date: string): boolean {
  return task.status === "완료"
    && Boolean(task.completed_at)
    && toDateStringFromTimestamp(task.completed_at!) === date;
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

export function sortTasks(tasks: TaskWithDetails[], sortBy: TaskSortBy): TaskWithDetails[] {
  return [...tasks].sort((a, b) => {
    switch (sortBy) {
      case "due_date": {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      }
      case "created_at":
        return b.created_at.localeCompare(a.created_at);
      case "updated_at":
        return b.updated_at.localeCompare(a.updated_at);
      default:
        return 0;
    }
  });
}
