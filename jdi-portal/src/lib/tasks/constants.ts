import type { TaskStatus, TaskPriority, TaskViewId, TaskGroupBy, TaskSortBy, ActivityType, TaskFilterState } from "./types";

export const TASK_STATUS_CONFIG: Record<TaskStatus, { bg: string; text: string; dot: string; icon: string }> = {
  "대기": { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400", icon: "ph-circle" },
  "진행중": { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500", icon: "ph-circle-dashed" },
  "완료": { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500", icon: "ph-check-circle" },
};

export const PRIORITY_CONFIG: Record<TaskPriority, { bg: string; text: string; dot: string; border: string }> = {
  "긴급": { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500", border: "border-red-100" },
  "높음": { bg: "bg-orange-50", text: "text-orange-600", dot: "bg-orange-500", border: "border-orange-100" },
  "보통": { bg: "bg-blue-50", text: "text-blue-600", dot: "bg-blue-500", border: "border-blue-100" },
  "낮음": { bg: "bg-slate-50", text: "text-slate-500", dot: "bg-slate-400", border: "border-slate-200" },
};

export const CATEGORIES = ["상품", "CS", "마케팅", "운영", "개발", "기타"] as const;

export const TASK_STATUSES: TaskStatus[] = ["대기", "진행중", "완료"];
export const TASK_PRIORITIES: TaskPriority[] = ["긴급", "높음", "보통", "낮음"];

export const TASK_VIEWS: Record<TaskViewId, { label: string; icon: string }> = {
  list: { label: "리스트", icon: "ph-list-dashes" },
  calendar: { label: "캘린더", icon: "ph-calendar-blank" },
  timeline: { label: "타임라인", icon: "ph-chart-bar-horizontal" },
};

export const GROUP_BY_OPTIONS: Record<TaskGroupBy, string> = {
  status: "상태별",
  assignee: "담당자별",
  category: "카테고리별",
  priority: "우선순위별",
};

export const SORT_BY_OPTIONS: Record<TaskSortBy, string> = {
  due_date: "마감일",
  priority: "우선순위",
  created_at: "생성일",
  updated_at: "최근 업데이트",
};

export const ACTIVITY_TYPE_CONFIG: Record<ActivityType, { label: string; icon: string }> = {
  comment: { label: "댓글", icon: "ph-chat-circle-dots" },
  status_change: { label: "상태 변경", icon: "ph-arrow-right" },
  assignee_change: { label: "담당자 변경", icon: "ph-user-switch" },
  priority_change: { label: "우선순위 변경", icon: "ph-flag" },
  attachment: { label: "파일 첨부", icon: "ph-paperclip" },
  checklist: { label: "체크리스트", icon: "ph-check-square" },
  edit: { label: "수정", icon: "ph-pencil-simple" },
};

export const DEFAULT_FILTER_STATE: TaskFilterState = {
  assignee: null,
  category: null,
  priority: null,
  status: null,
  groupBy: "status",
  sortBy: "due_date",
};
