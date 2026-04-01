import type { TaskStatus, TaskPriority } from "./types";

export const TASK_STATUS_CONFIG: Record<TaskStatus, { bg: string; text: string; dot: string }> = {
  "대기": { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  "진행중": { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500" },
  "완료": { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500" },
};

export const PRIORITY_CONFIG: Record<TaskPriority, { bg: string; text: string; dot: string }> = {
  "긴급": { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500" },
  "높음": { bg: "bg-orange-50", text: "text-orange-600", dot: "bg-orange-500" },
  "보통": { bg: "bg-brand-50", text: "text-brand-600", dot: "bg-brand-500" },
  "낮음": { bg: "bg-slate-50", text: "text-slate-500", dot: "bg-slate-400" },
};

export const CATEGORIES = ["상품", "CS", "마케팅", "운영", "개발", "기타"] as const;

export const TASK_STATUSES: TaskStatus[] = ["대기", "진행중", "완료"];
export const TASK_PRIORITIES: TaskPriority[] = ["긴급", "높음", "보통", "낮음"];
