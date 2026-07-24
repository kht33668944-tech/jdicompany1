import type { ProjectRef } from "@/lib/projects/types";

export interface WorkTimelineProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface WorkTimelineAttachment {
  id: string;
  entry_id: string;
  file_name: string;
  file_path: string;
  thumbnail_path: string | null;
  mime_type: string;
  file_size: number;
  position: number;
  created_at: string;
  original_url: string | null;
  thumbnail_url: string | null;
}

export interface WorkTimelineEntry {
  id: string;
  user_id: string;
  task_id: string | null;
  project_id: string | null;
  title: string;
  description: string | null;
  completed_at: string;
  created_at: string;
  updated_at: string;
}

export interface WorkTimelineEntryWithProfile extends WorkTimelineEntry {
  author_profile: WorkTimelineProfile;
  attachments: WorkTimelineAttachment[];
  project: ProjectRef | null;
}

export interface WorkTimelineFilters {
  limit?: number;
  offset?: number;
  cursor?: { completedAt: string; id: string } | null;
  employeeId?: string | null;
  date?: string | null;
  query?: string | null;
  includeAttachments?: boolean;
  projectId?: string | null; // "none" = 미분류
}

export interface CreateWorkTimelineEntryInput {
  title: string;
  description?: string | null;
  completedAt?: string | null;
  taskId?: string | null;
  projectId?: string | null;
}

export interface UpdateWorkTimelineEntryInput {
  title?: string;
  description?: string | null;
  completedAt?: string;
  projectId?: string | null;
}

export interface WorkTimelineFileUpload {
  file: File;
  thumbnail?: File | null;
}

export interface WorkTimelineAttachmentInput {
  fileName: string;
  filePath: string;
  thumbnailPath: string | null;
  mimeType: string;
  fileSize: number;
  position: number;
}

export interface CreateWorkTimelineEntryResult {
  entry: WorkTimelineEntry;
  duplicate: boolean;
}

export interface WorkTimelineTaskShareState {
  canShare: boolean;
  existingEntryId: string | null;
  reason: "available" | "already_shared" | "not_completed" | "not_owner_or_assignee" | "not_found";
  task: {
    id: string;
    title: string;
    description: string | null;
    completedAt: string;
  } | null;
}

export type ReviewState = "open" | "submitted" | "approved" | "cancelled";
export type ReviewEventKind =
  | "requested" | "submitted" | "approved" | "rejected" | "cancelled";

export interface WorkTimelineReview {
  id: string;
  entry_id: string;
  reviewer_id: string;
  author_id: string;
  task_id: string | null;
  comment: string;
  state: ReviewState;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
  reviewer_name: string | null;
  author_name: string | null;
  task_status: string | null; // 연결 할일의 status (표시용)
}

export interface WorkTimelineReviewEvent {
  id: string;
  review_id: string;
  actor_id: string;
  actor_name: string | null;
  kind: ReviewEventKind;
  note: string | null;
  created_at: string;
}

export interface WorkTimelineReviewWithEvents extends WorkTimelineReview {
  events: WorkTimelineReviewEvent[];
}

/** 대시보드 검토 인박스 한 건 (보완할 것 / 확인할 것 공용) */
export interface PendingReviewItem {
  reviewId: string;
  entryId: string;
  entryTitle: string;
  comment: string;
  counterpartName: string | null;
  createdAt: string;
  taskId: string | null;
}
