import type { SchedulePresetCategory } from "./types";

export interface CategoryStyle {
  label: string;
  labelKo: string;
  bg: string;
  text: string;
  dot: string;
  badge: string;
  border: string;
}

export const SCHEDULE_CATEGORY_CONFIG: Record<SchedulePresetCategory, CategoryStyle> = {
  INTERNAL: {
    label: "INTERNAL",
    labelKo: "내부 미팅",
    bg: "bg-blue-50",
    text: "text-blue-600",
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-700",
    border: "border-l-blue-500",
  },
  REPORT: {
    label: "REPORT",
    labelKo: "보고/리포트",
    bg: "bg-indigo-50",
    text: "text-indigo-600",
    dot: "bg-indigo-500",
    badge: "bg-indigo-100 text-indigo-700",
    border: "border-l-indigo-500",
  },
  EXTERNAL: {
    label: "EXTERNAL",
    labelKo: "외부 미팅",
    bg: "bg-orange-50",
    text: "text-orange-600",
    dot: "bg-orange-500",
    badge: "bg-orange-100 text-orange-700",
    border: "border-l-orange-500",
  },
  VACATION: {
    label: "VACATION",
    labelKo: "연차/휴가",
    bg: "bg-emerald-50",
    text: "text-emerald-600",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-700",
    border: "border-l-emerald-500",
  },
  MAINTENANCE: {
    label: "MAINTENANCE",
    labelKo: "서버 점검",
    bg: "bg-rose-50",
    text: "text-rose-600",
    dot: "bg-rose-500",
    badge: "bg-rose-100 text-rose-700",
    border: "border-l-rose-500",
  },
};

export const SCHEDULE_CATEGORIES: SchedulePresetCategory[] = [
  "INTERNAL",
  "REPORT",
  "EXTERNAL",
  "VACATION",
  "MAINTENANCE",
];

const DEFAULT_STYLE: CategoryStyle = {
  label: "OTHER",
  labelKo: "기타",
  bg: "bg-slate-50",
  text: "text-slate-600",
  dot: "bg-slate-400",
  badge: "bg-slate-100 text-slate-600",
  border: "border-l-slate-400",
};

export function getCategoryStyle(category: string): CategoryStyle {
  if (category in SCHEDULE_CATEGORY_CONFIG) {
    return SCHEDULE_CATEGORY_CONFIG[category as SchedulePresetCategory];
  }
  return { ...DEFAULT_STYLE, label: category, labelKo: category };
}
