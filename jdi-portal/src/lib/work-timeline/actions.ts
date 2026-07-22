"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  WORK_TIMELINE_BUCKET,
  WORK_TIMELINE_MAX_ATTACHMENTS,
  WORK_TIMELINE_MAX_FILE_SIZE,
  WORK_TIMELINE_SIGNED_URL_TTL_SECONDS,
} from "./constants";
import type {
  CreateWorkTimelineEntryInput,
  CreateWorkTimelineEntryResult,
  UpdateWorkTimelineEntryInput,
  WorkTimelineAttachment,
  WorkTimelineAttachmentInput,
  WorkTimelineEntry,
  WorkTimelineTaskShareState,
} from "./types";
import {
  assertUuid,
  getBlockedExtension,
  isUniqueViolation,
  validateWorkTimelineInput,
} from "./utils";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** 프로젝트 FK(23503) 위반: 선택한 프로젝트가 이미 삭제된 경우 */
function isProjectFkViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message, details } = error as { code?: string; message?: string; details?: string };
  return code === "23503" && `${message ?? ""} ${details ?? ""}`.includes("project");
}

async function getAuthenticatedContext(): Promise<{ supabase: ServerClient; userId: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: data.user.id };
}

function revalidateTimeline(entryId?: string, taskId?: string | null): void {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/work-timeline");
  if (entryId) revalidatePath(`/dashboard/work-timeline/${entryId}`);
  if (taskId) revalidatePath(`/dashboard/tasks/${taskId}`);
}

async function findDuplicateTaskEntry(
  supabase: ServerClient,
  userId: string,
  taskId: string,
): Promise<WorkTimelineEntry | null> {
  const { data, error } = await supabase
    .from("work_timeline_entries")
    .select("id, user_id, task_id, project_id, title, description, completed_at, created_at, updated_at")
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .maybeSingle();
  if (error) throw error;
  return data as WorkTimelineEntry | null;
}

async function insertEntry(
  supabase: ServerClient,
  userId: string,
  input: CreateWorkTimelineEntryInput,
): Promise<CreateWorkTimelineEntryResult> {
  const values = validateWorkTimelineInput(input);
  if (input.projectId) assertUuid(input.projectId, "프로젝트");
  if (input.taskId) {
    assertUuid(input.taskId, "연결 업무");
    const existing = await findDuplicateTaskEntry(supabase, userId, input.taskId);
    if (existing) return { entry: existing, duplicate: true };
    const [taskResult, assigneeResult] = await Promise.all([
      supabase
        .from("tasks")
        .select("status, created_by")
        .eq("id", input.taskId)
        .maybeSingle(),
      supabase
        .from("task_assignees")
        .select("user_id")
        .eq("task_id", input.taskId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (taskResult.error) throw taskResult.error;
    if (assigneeResult.error) throw assigneeResult.error;
    if (!taskResult.data) throw new Error("연결할 업무를 찾을 수 없습니다.");
    if (taskResult.data.status !== "완료") throw new Error("완료된 업무만 타임라인에 공유할 수 있습니다.");
    if (taskResult.data.created_by !== userId && !assigneeResult.data) {
      throw new Error("본인이 생성했거나 담당자로 지정된 업무만 공유할 수 있습니다.");
    }
  }
  const { data, error } = await supabase
    .from("work_timeline_entries")
    .insert({
      user_id: userId,
      task_id: input.taskId || null,
      project_id: input.projectId || null,
      title: values.title,
      description: values.description,
      completed_at: values.completedAt,
    })
    .select("id, user_id, task_id, project_id, title, description, completed_at, created_at, updated_at")
    .single();

  if (error && input.taskId && isUniqueViolation(error)) {
    const existing = await findDuplicateTaskEntry(supabase, userId, input.taskId);
    if (existing) return { entry: existing, duplicate: true };
  }
  if (error) {
    if (isProjectFkViolation(error)) {
      throw new Error("선택한 프로젝트가 삭제되었습니다. 프로젝트를 다시 선택해 주세요.");
    }
    throw error;
  }
  return { entry: data as WorkTimelineEntry, duplicate: false };
}

export async function createWorkTimelineEntry(
  input: CreateWorkTimelineEntryInput,
): Promise<CreateWorkTimelineEntryResult> {
  const { supabase, userId } = await getAuthenticatedContext();
  const result = await insertEntry(supabase, userId, input);
  revalidateTimeline(result.entry.id, result.entry.task_id);
  return result;
}

export async function updateWorkTimelineEntry(
  entryId: string,
  input: UpdateWorkTimelineEntryInput,
): Promise<WorkTimelineEntry> {
  assertUuid(entryId, "업무 타임라인");
  const { supabase } = await getAuthenticatedContext();
  const currentResult = await supabase
    .from("work_timeline_entries")
    .select("title, description, completed_at")
    .eq("id", entryId)
    .single();
  if (currentResult.error) throw currentResult.error;
  const values = validateWorkTimelineInput({
    title: input.title ?? currentResult.data.title,
    description: input.description !== undefined ? input.description : currentResult.data.description,
    completedAt: input.completedAt ?? currentResult.data.completed_at,
  });
  const updatePayload: Record<string, unknown> = {
    title: values.title,
    description: values.description,
    completed_at: values.completedAt,
    updated_at: new Date().toISOString(),
  };
  if (input.projectId !== undefined) {
    if (input.projectId) assertUuid(input.projectId, "프로젝트");
    updatePayload.project_id = input.projectId;
  }
  const { data, error } = await supabase
    .from("work_timeline_entries")
    .update(updatePayload)
    .eq("id", entryId)
    .select("id, user_id, task_id, project_id, title, description, completed_at, created_at, updated_at")
    .single();
  if (error) {
    if (isProjectFkViolation(error)) {
      throw new Error("선택한 프로젝트가 삭제되었습니다. 프로젝트를 다시 선택해 주세요.");
    }
    throw error;
  }
  revalidateTimeline(entryId, data.task_id);
  return data as WorkTimelineEntry;
}

function getStoragePathOwner(path: string): string {
  const [ownerId, entryId, fileName, extra] = path.split("/");
  assertUuid(ownerId, "저장소 소유자");
  assertUuid(entryId, "저장소 업무 타임라인");
  if (!fileName || extra !== undefined) throw new Error("저장소 경로가 올바르지 않습니다.");
  return ownerId;
}

async function canManageStorageOwners(
  supabase: ServerClient,
  userId: string,
  owners: Set<string>,
): Promise<boolean> {
  if ([...owners].every((ownerId) => ownerId === userId)) return true;
  const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (error) throw error;
  return data.role === "admin";
}

async function queueAndRemoveStoragePaths(
  supabase: ServerClient,
  userId: string,
  paths: string[],
): Promise<boolean> {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (uniquePaths.length === 0) return false;
  const rows = uniquePaths.map((path) => ({ owner_id: getStoragePathOwner(path), path }));
  const owners = new Set(rows.map((row) => row.owner_id));
  if (!await canManageStorageOwners(supabase, userId, owners)) {
    throw new Error("본인의 업무 타임라인 파일만 정리할 수 있습니다.");
  }

  const { error: queueError } = await supabase
    .from("work_timeline_storage_cleanup_queue")
    .upsert(rows, { onConflict: "path", ignoreDuplicates: true });
  if (queueError) throw queueError;

  const attemptedAt = new Date().toISOString();
  const { error: storageError } = await supabase.storage.from(WORK_TIMELINE_BUCKET).remove(uniquePaths);
  if (storageError) {
    const { data: queuedRows, error: queuedRowsError } = await supabase
      .from("work_timeline_storage_cleanup_queue")
      .select("owner_id, path, attempts")
      .in("path", uniquePaths);
    const { error: markError } = queuedRowsError
      ? { error: queuedRowsError }
      : await supabase
          .from("work_timeline_storage_cleanup_queue")
          .upsert((queuedRows ?? []).map((row) => ({
            owner_id: row.owner_id,
            path: row.path,
            attempts: row.attempts + 1,
            last_error: storageError.message,
            last_attempt_at: attemptedAt,
          })), { onConflict: "path" });
    if (markError) console.error("Storage 정리 실패 기록 갱신에 실패했습니다.", { paths: uniquePaths, markError });
    return true;
  }

  const { error: clearError } = await supabase
    .from("work_timeline_storage_cleanup_queue")
    .delete()
    .in("path", uniquePaths);
  if (clearError) {
    console.warn("정리 완료된 Storage 대기열 삭제에 실패했습니다.", { paths: uniquePaths, clearError });
  }
  return false;
}

export async function cleanupWorkTimelineStoragePaths(
  paths: string[],
): Promise<{ storageCleanupFailed: boolean }> {
  const { supabase, userId } = await getAuthenticatedContext();
  const storageCleanupFailed = await queueAndRemoveStoragePaths(supabase, userId, paths);
  return { storageCleanupFailed };
}

export async function retryPendingWorkTimelineStorageCleanup(): Promise<number> {
  const { supabase, userId } = await getAuthenticatedContext();
  const { data, error } = await supabase
    .from("work_timeline_storage_cleanup_queue")
    .select("path")
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw error;
  const paths = (data ?? []).map((row) => row.path);
  if (paths.length === 0) return 0;
  const failed = await queueAndRemoveStoragePaths(supabase, userId, paths);
  return failed ? 0 : paths.length;
}

function validateAttachmentInput(
  input: WorkTimelineAttachmentInput,
  userId: string,
  entryId: string,
): void {
  if (!input.fileName.trim() || input.fileName.length > 255) throw new Error("첨부 파일 이름이 올바르지 않습니다.");
  const blocked = getBlockedExtension(input.fileName);
  if (blocked === "") throw new Error("확장자가 없는 파일은 첨부할 수 없습니다.");
  if (blocked) throw new Error(`보안상 '.${blocked}' 형식의 파일은 첨부할 수 없습니다.`);
  if (input.mimeType.length > 255) throw new Error("첨부 파일 형식이 올바르지 않습니다.");
  if (!Number.isInteger(input.fileSize) || input.fileSize < 1 || input.fileSize > WORK_TIMELINE_MAX_FILE_SIZE) {
    throw new Error("첨부 파일 크기가 올바르지 않습니다.");
  }
  if (!Number.isInteger(input.position) || input.position < 0 || input.position >= WORK_TIMELINE_MAX_ATTACHMENTS) {
    throw new Error("첨부 파일 순서가 올바르지 않습니다.");
  }
  const expectedPrefix = `${userId}/${entryId}/`;
  if (!input.filePath.startsWith(expectedPrefix) || getStoragePathOwner(input.filePath) !== userId) {
    throw new Error("첨부 파일 경로가 올바르지 않습니다.");
  }
  if (input.thumbnailPath) {
    if (
      !input.thumbnailPath.startsWith(expectedPrefix)
      || getStoragePathOwner(input.thumbnailPath) !== userId
    ) {
      throw new Error("첨부 파일 썸네일 경로가 올바르지 않습니다.");
    }
    // 썸네일도 신뢰 경계 방어: 위험 확장자 차단 (직접 호출 대비)
    const thumbnailName = input.thumbnailPath.split("/").pop() ?? "";
    if (getBlockedExtension(thumbnailName)) {
      throw new Error("첨부 파일 썸네일 형식이 올바르지 않습니다.");
    }
  }
}

export async function finalizeWorkTimelineAttachments(
  entryId: string,
  inputs: WorkTimelineAttachmentInput[],
): Promise<WorkTimelineAttachment[]> {
  assertUuid(entryId, "업무 타임라인");
  if (inputs.length === 0) return [];
  if (inputs.length > WORK_TIMELINE_MAX_ATTACHMENTS) {
    throw new Error(`파일은 최대 ${WORK_TIMELINE_MAX_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
  }
  const { supabase, userId } = await getAuthenticatedContext();
  const [{ data: entry, error: entryError }, { data: existing, error: existingError }] = await Promise.all([
    supabase.from("work_timeline_entries").select("user_id").eq("id", entryId).single(),
    supabase.from("work_timeline_attachments").select("position").eq("entry_id", entryId),
  ]);
  if (entryError) throw entryError;
  if (entry.user_id !== userId) throw new Error("본인의 업무 타임라인에만 파일을 추가할 수 있습니다.");
  if (existingError) throw existingError;
  if ((existing?.length ?? 0) + inputs.length > WORK_TIMELINE_MAX_ATTACHMENTS) {
    throw new Error(`파일은 최대 ${WORK_TIMELINE_MAX_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
  }

  const occupied = new Set((existing ?? []).map((row) => row.position));
  const incomingPositions = new Set<number>();
  for (const input of inputs) {
    validateAttachmentInput(input, userId, entryId);
    if (occupied.has(input.position) || incomingPositions.has(input.position)) {
      throw new Error("이미 사용 중인 첨부 순서입니다.");
    }
    incomingPositions.add(input.position);
  }

  const { data, error } = await supabase
    .from("work_timeline_attachments")
    .insert(inputs.map((input) => ({
      entry_id: entryId,
      file_name: input.fileName,
      file_path: input.filePath,
      thumbnail_path: input.thumbnailPath,
      mime_type: input.mimeType.trim() || "application/octet-stream",
      file_size: input.fileSize,
      position: input.position,
    })))
    .select("id, entry_id, file_name, file_path, thumbnail_path, mime_type, file_size, position, created_at");
  if (error) throw error;
  revalidateTimeline(entryId);
  return (data ?? []).map((attachment) => ({
    ...attachment,
    original_url: null,
    thumbnail_url: null,
  })) as WorkTimelineAttachment[];
}

export async function deleteWorkTimelineEntry(
  entryId: string,
): Promise<{ storageCleanupFailed: boolean }> {
  assertUuid(entryId, "업무 타임라인");
  const { supabase, userId } = await getAuthenticatedContext();
  const { data: attachments, error: attachmentFetchError } = await supabase
    .from("work_timeline_attachments")
    .select("file_path, thumbnail_path")
    .eq("entry_id", entryId);
  if (attachmentFetchError) throw attachmentFetchError;
  const paths = (attachments ?? []).flatMap((row) =>
    [row.file_path, row.thumbnail_path].filter(Boolean) as string[],
  );
  if (paths.length > 0) {
    const rows = paths.map((path) => ({ owner_id: getStoragePathOwner(path), path }));
    const { error: queueError } = await supabase
      .from("work_timeline_storage_cleanup_queue")
      .upsert(rows, { onConflict: "path", ignoreDuplicates: true });
    if (queueError) throw queueError;
  }

  const { data: deleted, error } = await supabase
    .from("work_timeline_entries")
    .delete()
    .eq("id", entryId)
    .select("task_id")
    .single();
  if (error) {
    if (paths.length > 0) {
      const { error: queueRollbackError } = await supabase
        .from("work_timeline_storage_cleanup_queue")
        .delete()
        .in("path", paths);
      if (queueRollbackError) {
        console.error("업무 타임라인 삭제 실패 후 정리 대기열 롤백에 실패했습니다.", {
          entryId,
          paths,
          queueRollbackError,
        });
      }
    }
    throw error;
  }

  const storageCleanupFailed = await queueAndRemoveStoragePaths(supabase, userId, paths);
  revalidateTimeline(entryId, deleted.task_id);
  return { storageCleanupFailed };
}

export async function deleteWorkTimelineAttachment(
  attachmentId: string,
  entryId: string,
): Promise<{ storageCleanupFailed: boolean }> {
  assertUuid(attachmentId, "첨부 이미지");
  assertUuid(entryId, "업무 타임라인");
  const { supabase, userId } = await getAuthenticatedContext();
  const { data, error: fetchError } = await supabase
    .from("work_timeline_attachments")
    .select("file_path, thumbnail_path")
    .eq("id", attachmentId)
    .eq("entry_id", entryId)
    .single();
  if (fetchError) throw fetchError;

  const paths = [data.file_path, data.thumbnail_path].filter(Boolean) as string[];
  const queueRows = paths.map((path) => ({ owner_id: getStoragePathOwner(path), path }));
  const { error: queueError } = await supabase
    .from("work_timeline_storage_cleanup_queue")
    .upsert(queueRows, { onConflict: "path", ignoreDuplicates: true });
  if (queueError) throw queueError;

  const { error } = await supabase
    .from("work_timeline_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("entry_id", entryId)
    .select("id")
    .single();
  if (error) {
    const { error: queueRollbackError } = await supabase
      .from("work_timeline_storage_cleanup_queue")
      .delete()
      .in("path", paths);
    if (queueRollbackError) {
      console.error("첨부 이미지 삭제 실패 후 정리 대기열 롤백에 실패했습니다.", {
        entryId,
        attachmentId,
        paths,
        queueRollbackError,
      });
    }
    throw error;
  }

  const storageCleanupFailed = await queueAndRemoveStoragePaths(supabase, userId, paths);
  revalidateTimeline(entryId);
  return { storageCleanupFailed };
}

export async function getWorkTimelineSignedUrls(paths: string[]): Promise<Record<string, string>> {
  const { supabase } = await getAuthenticatedContext();
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (uniquePaths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(WORK_TIMELINE_BUCKET)
    .createSignedUrls(uniquePaths, WORK_TIMELINE_SIGNED_URL_TTL_SECONDS);
  if (error) throw error;

  const result: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) result[item.path] = item.signedUrl;
  }
  return result;
}

export async function getTaskTimelineShare(taskId: string): Promise<WorkTimelineTaskShareState> {
  assertUuid(taskId, "업무");
  const { supabase, userId } = await getAuthenticatedContext();
  const [taskResult, assigneeResult, existingResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, description, status, completed_at, updated_at, created_by")
      .eq("id", taskId)
      .maybeSingle(),
    supabase.from("task_assignees").select("user_id").eq("task_id", taskId).eq("user_id", userId).maybeSingle(),
    supabase
      .from("work_timeline_entries")
      .select("id")
      .eq("task_id", taskId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (taskResult.error) throw taskResult.error;
  if (assigneeResult.error) throw assigneeResult.error;
  if (existingResult.error) throw existingResult.error;

  const task = taskResult.data;
  if (!task) return { canShare: false, existingEntryId: null, reason: "not_found", task: null };
  const payload = {
    id: task.id,
    title: task.title,
    description: task.description,
    completedAt: task.completed_at ?? task.updated_at,
  };
  if (existingResult.data) {
    return {
      canShare: false,
      existingEntryId: existingResult.data.id,
      reason: "already_shared",
      task: payload,
    };
  }
  if (task.status !== "완료") {
    return { canShare: false, existingEntryId: null, reason: "not_completed", task: payload };
  }
  if (task.created_by !== userId && !assigneeResult.data) {
    return { canShare: false, existingEntryId: null, reason: "not_owner_or_assignee", task: payload };
  }
  return { canShare: true, existingEntryId: null, reason: "available", task: payload };
}
