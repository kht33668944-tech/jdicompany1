export type NotificationType =
  | "task_assigned"
  | "task_comment"
  | "task_status_changed"
  | "task_deadline"
  | "vacation_approved"
  | "vacation_rejected"
  | "schedule_invite"
  | "system_announce"
  | "signup_pending"
  | "chat_message"
  | "work_schedule_change_requested"
  | "work_schedule_approved"
  | "work_schedule_rejected"
  | "hire_date_change_requested"
  | "hire_date_approved"
  | "hire_date_rejected"
  | "ip_change_requested"
  | "ip_change_approved"
  | "ip_change_rejected"
  | "report_submitted"
  | "report_status_changed";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}
