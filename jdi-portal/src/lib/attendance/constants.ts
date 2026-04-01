export const ATTENDANCE_STATUS_CONFIG = {
  "미출근": { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  "근무중": { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500" },
  "퇴근": { bg: "bg-brand-50", text: "text-brand-600", dot: "bg-brand-500" },
} as const;

export type AttendanceTabId = "checkin" | "records" | "vacation" | "admin";
