import type { NotificationType } from "./types";

export const NOTIFICATION_TYPE_CONFIG: Record<
  NotificationType,
  { label: string; icon: string; color: string }
> = {
  task_assigned: { label: "할일 배정", icon: "UserPlus", color: "text-blue-500" },
  task_comment: { label: "댓글", icon: "ChatDots", color: "text-green-500" },
  task_status_changed: { label: "상태 변경", icon: "ArrowsClockwise", color: "text-amber-500" },
  task_deadline: { label: "마감일 임박", icon: "Warning", color: "text-red-500" },
  vacation_approved: { label: "휴가 승인", icon: "CheckCircle", color: "text-emerald-500" },
  vacation_rejected: { label: "휴가 반려", icon: "XCircle", color: "text-red-500" },
  schedule_invite: { label: "일정 초대", icon: "CalendarPlus", color: "text-purple-500" },
  system_announce: { label: "시스템 공지", icon: "Megaphone", color: "text-blue-600" },
  signup_pending: { label: "가입 승인 대기", icon: "UserCirclePlus", color: "text-orange-500" },
  chat_message: { label: "채팅 메시지", icon: "ChatCircle", color: "text-indigo-500" },
  work_schedule_change_requested: { label: "근무시간 변경 요청", icon: "Clock", color: "text-violet-500" },
  work_schedule_approved: { label: "근무시간 변경 승인", icon: "CheckCircle", color: "text-emerald-500" },
  work_schedule_rejected: { label: "근무시간 변경 반려", icon: "XCircle", color: "text-red-500" },
  hire_date_change_requested: { label: "입사일 변경 요청", icon: "CalendarBlank", color: "text-violet-500" },
  hire_date_approved: { label: "입사일 변경 승인", icon: "CheckCircle", color: "text-emerald-500" },
  hire_date_rejected: { label: "입사일 변경 반려", icon: "XCircle", color: "text-red-500" },
};

/** notification_settings 컬럼 → NotificationType[] 매핑 */
export const SETTING_TYPE_MAP: Record<string, NotificationType[]> = {
  vacation_notify: ["vacation_approved", "vacation_rejected"],
  schedule_remind: ["schedule_invite"],
  task_deadline: ["task_deadline", "task_assigned", "task_comment", "task_status_changed"],
  system_announce: ["system_announce", "signup_pending"],
  chat_message_notify: ["chat_message"],
};
