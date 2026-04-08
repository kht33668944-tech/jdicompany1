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
  | "work_schedule_rejected";

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
