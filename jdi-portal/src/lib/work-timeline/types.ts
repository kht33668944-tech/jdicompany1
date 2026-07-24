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
  comment: string;
  state: ReviewState;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
  reviewer_name: string | null;
  author_name: string | null;
}

/** 보완 이벤트(kind='submitted')에 붙는 첨부 파일. url 은 조회 시 발급하는 서명 URL. */
export interface WorkTimelineReviewAttachment {
  id: string;
  event_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  url: string | null;
}

export interface WorkTimelineReviewEvent {
  id: string;
  review_id: string;
  actor_id: string;
  actor_name: string | null;
  kind: ReviewEventKind;
  note: string | null;
  created_at: string;
  attachments: WorkTimelineReviewAttachment[];
}

/** 보완 제출 시 서버 액션으로 넘기는 업로드 완료 첨부 메타데이터. */
export interface ReviewRemediationAttachmentInput {
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
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
}
