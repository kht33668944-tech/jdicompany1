export type TaskStatus = "대기" | "진행중" | "완료";
export type TaskPriority = "긴급" | "높음" | "보통" | "낮음";
export type TaskViewId = "list" | "calendar" | "timeline";
export type TaskGroupBy = "status" | "assignee" | "category" | "priority";
export type TaskSortBy = "due_date" | "priority" | "created_at" | "updated_at";
export type ActivityType =
  | "comment"
  | "status_change"
  | "assignee_change"
  | "priority_change"
  | "attachment"
  | "checklist"
  | "edit";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category: string | null;
  due_date: string | null;
  start_date: string | null;
  position: number;
  parent_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskAssignee {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface TaskWithDetails extends Task {
  creator_profile: { full_name: string; avatar_url: string | null };
  assignees: TaskAssignee[];
  checklist_total: number;
  checklist_completed: number;
  subtask_count: number;
  comment_count: number;
  attachment_count: number;
  children?: TaskWithDetails[];
}

export interface TaskChecklistItem {
  id: string;
  task_id: string;
  content: string;
  is_completed: boolean;
  position: number;
  created_at: string;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  uploader_profile: { full_name: string };
}

export interface TaskActivity {
  id: string;
  task_id: string;
  user_id: string;
  type: ActivityType;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user_profile: { full_name: string; avatar_url: string | null };
}

export interface TaskSummary {
  total: number;
  by_status: Record<TaskStatus, number>;
  overdue: number;
  completed_this_week: number;
}

export interface TaskFilterState {
  assignee: string | null;
  category: string | null;
  priority: TaskPriority | null;
  status: TaskStatus | null;
  groupBy: TaskGroupBy;
  sortBy: TaskSortBy;
}
