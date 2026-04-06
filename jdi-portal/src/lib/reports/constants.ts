import type { ReportType, ReportStatus, ReportPage } from "./types";

export const REPORT_TYPE_CONFIG: Record<ReportType, { label: string; bg: string; text: string; border: string }> = {
  bug: { label: "오류", bg: "bg-red-50", text: "text-red-600", border: "border-red-100" },
  inconvenience: { label: "불편사항", bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-100" },
  improvement: { label: "개선요청", bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-100" },
};

export const REPORT_STATUS_CONFIG: Record<ReportStatus, { label: string; bg: string; text: string }> = {
  submitted: { label: "접수됨", bg: "bg-slate-100", text: "text-slate-600" },
  in_progress: { label: "처리중", bg: "bg-blue-100", text: "text-blue-600" },
  completed: { label: "완료", bg: "bg-green-100", text: "text-green-600" },
};

export const REPORT_PAGE_CONFIG: Record<ReportPage, { label: string }> = {
  dashboard: { label: "대시보드" },
  attendance: { label: "근태관리" },
  tasks: { label: "할일" },
  schedule: { label: "스케줄" },
  settings: { label: "설정" },
};

export const REPORT_TYPES: ReportType[] = ["bug", "inconvenience", "improvement"];
export const REPORT_STATUSES: ReportStatus[] = ["submitted", "in_progress", "completed"];
export const REPORT_PAGES: ReportPage[] = ["dashboard", "attendance", "tasks", "schedule", "settings"];
