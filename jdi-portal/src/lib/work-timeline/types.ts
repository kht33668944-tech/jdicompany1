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
  title: string;
  description: string | null;
  completed_at: string;
  created_at: string;
  updated_at: string;
}

export interface WorkTimelineEntryWithProfile extends WorkTimelineEntry {
  author_profile: WorkTimelineProfile;
  attachments: WorkTimelineAttachment[];
}

export interface WorkTimelineFilters {
  limit?: number;
  offset?: number;
  cursor?: { completedAt: string; id: string } | null;
  employeeId?: string | null;
  date?: string | null;
  query?: string | null;
  includeAttachments?: boolean;
}

export interface CreateWorkTimelineEntryInput {
  title: string;
  description?: string | null;
  completedAt?: string | null;
  taskId?: string | null;
}

export interface UpdateWorkTimelineEntryInput {
  title?: string;
  description?: string | null;
  completedAt?: string;
}

export interface WorkTimelineImageUpload {
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
