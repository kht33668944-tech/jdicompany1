export type TaskStatus = "대기" | "진행중" | "완료";
export type TaskPriority = "긴급" | "높음" | "보통" | "낮음";
export type TaskTabId = "board" | "my-tasks";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category: string | null;
  due_date: string | null;
  position: number;
  created_by: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskWithProfile extends Task {
  assigned_profile: { full_name: string } | null;
  creator_profile: { full_name: string };
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: { full_name: string };
}
