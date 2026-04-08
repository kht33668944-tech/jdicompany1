export type SettingsTab = "profile" | "account" | "notifications" | "admin";

export interface NotificationSettings {
  user_id: string;
  vacation_notify: boolean;
  schedule_remind: boolean;
  task_deadline: boolean;
  system_announce: boolean;
  push_enabled: boolean;
  chat_message_notify: boolean;
}

export interface Department {
  id: string;
  name: string;
  created_at: string;
}
