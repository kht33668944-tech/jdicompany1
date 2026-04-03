import { createClient } from "@/lib/supabase/client";
import { TASK_PRIORITIES, TASK_STATUSES } from "./constants";
import type { TaskPriority, TaskStatus, TaskChecklistItem, TaskAttachment, TaskActivity } from "./types";

function getSupabase() {
  return createClient();
}

async function getNextPosition(supabase: ReturnType<typeof getSupabase>, status: TaskStatus) {
  const { data: maxRow, error } = await supabase
    .from("tasks")
    .select("position")
    .eq("status", status)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (maxRow?.position ?? -1) + 1;
}

async function logActivity(
  taskId: string,
  userId: string,
  type: string,
  content?: string | null,
  metadata?: Record<string, unknown> | null
) {
  const supabase = getSupabase();
  await supabase.from("task_activities").insert({
    task_id: taskId,
    user_id: userId,
    type,
    content: content ?? null,
    metadata: metadata ?? null,
  });
}

// ============================================================
// 할일 CRUD
// ============================================================

export async function createTask(params: {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: string;
  dueDate?: string;
  startDate?: string;
  createdBy: string;
  assigneeIds?: string[];
  parentId?: string;
}) {
  const supabase = getSupabase();
  const targetStatus = params.status ?? TASK_STATUSES[0];
  const nextPosition = await getNextPosition(supabase, targetStatus);

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: params.title,
      description: params.description || null,
      status: targetStatus,
      priority: params.priority ?? TASK_PRIORITIES[2],
      category: params.category || null,
      due_date: params.dueDate || null,
      start_date: params.startDate || null,
      position: nextPosition,
      created_by: params.createdBy,
      parent_id: params.parentId || null,
    })
    .select()
    .single();

  if (error) throw error;

  // 담당자 배정
  const assigneeIds = params.assigneeIds?.length ? params.assigneeIds : [params.createdBy];
  const assigneeRows = assigneeIds.map((userId) => ({
    task_id: data.id,
    user_id: userId,
  }));

  const { error: assigneeError } = await supabase
    .from("task_assignees")
    .insert(assigneeRows);

  if (assigneeError) throw assigneeError;

  return data;
}

export async function updateTask(
  taskId: string,
  userId: string,
  params: {
    title?: string;
    description?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    category?: string | null;
    dueDate?: string | null;
    startDate?: string | null;
  }
) {
  const supabase = getSupabase();
  const { data: currentTask, error: fetchError } = await supabase
    .from("tasks")
    .select("status, priority, title")
    .eq("id", taskId)
    .single();

  if (fetchError) throw fetchError;

  // 상태 변경 시 position 재배치 (SECURITY DEFINER RPC로 처리)
  const statusChanged = params.status !== undefined && params.status !== currentTask.status;
  if (statusChanged) {
    const nextPosition = await getNextPosition(supabase, params.status!);
    await moveTask(taskId, params.status!, nextPosition);
    await logActivity(taskId, userId, "status_change", null, {
      from: currentTask.status,
      to: params.status,
    });
  }

  // 우선순위 변경 로그
  if (params.priority !== undefined && params.priority !== currentTask.priority) {
    await logActivity(taskId, userId, "priority_change", null, {
      from: currentTask.priority,
      to: params.priority,
    });
  }

  // 실제 변경된 필드만 수집
  const updateData: Record<string, unknown> = {};

  if (params.title !== undefined && params.title !== currentTask.title) {
    updateData.title = params.title;
    await logActivity(taskId, userId, "edit", null, { field: "title" });
  }
  if (params.description !== undefined) updateData.description = params.description;
  if (params.priority !== undefined && params.priority !== currentTask.priority) updateData.priority = params.priority;
  if (params.category !== undefined) updateData.category = params.category;
  if (params.dueDate !== undefined) updateData.due_date = params.dueDate;
  if (params.startDate !== undefined) updateData.start_date = params.startDate;

  // 변경된 필드가 없으면 (상태만 변경된 경우 포함) 바로 리턴
  if (Object.keys(updateData).length === 0) {
    return currentTask;
  }

  updateData.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .update(updateData)
    .eq("id", taskId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data ?? currentTask;
}

export async function deleteTask(taskId: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}

export async function moveTask(taskId: string, newStatus: TaskStatus, newPosition: number) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("reorder_task", {
    p_task_id: taskId,
    p_new_status: newStatus,
    p_new_position: newPosition,
  });
  if (error) throw error;
}

// ============================================================
// 담당자
// ============================================================

export async function addAssignee(taskId: string, userId: string, currentUserId: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("task_assignees")
    .insert({ task_id: taskId, user_id: userId });
  if (error) throw error;

  await logActivity(taskId, currentUserId, "assignee_change", null, {
    added: [userId],
  });
}

export async function removeAssignee(taskId: string, userId: string, currentUserId: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("task_assignees")
    .delete()
    .eq("task_id", taskId)
    .eq("user_id", userId);
  if (error) throw error;

  await logActivity(taskId, currentUserId, "assignee_change", null, {
    removed: [userId],
  });
}

// ============================================================
// 체크리스트
// ============================================================

export async function addChecklistItem(taskId: string, content: string): Promise<TaskChecklistItem> {
  const supabase = getSupabase();

  const { data: maxRow } = await supabase
    .from("task_checklist_items")
    .select("position")
    .eq("task_id", taskId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPos = (maxRow?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("task_checklist_items")
    .insert({ task_id: taskId, content, position: nextPos })
    .select()
    .single();

  if (error) throw error;
  return data as TaskChecklistItem;
}

export async function updateChecklistItem(
  itemId: string,
  updates: { content?: string; is_completed?: boolean }
) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("task_checklist_items")
    .update(updates)
    .eq("id", itemId);
  if (error) throw error;
}

export async function deleteChecklistItem(itemId: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("task_checklist_items")
    .delete()
    .eq("id", itemId);
  if (error) throw error;
}

export async function reorderChecklist(taskId: string, itemIds: string[]) {
  const supabase = getSupabase();
  const updates = itemIds.map((id, index) =>
    supabase.from("task_checklist_items").update({ position: index }).eq("id", id)
  );
  await Promise.all(updates);
}

// ============================================================
// 첨부파일
// ============================================================

export async function uploadAttachment(
  taskId: string,
  userId: string,
  file: File
): Promise<TaskAttachment> {
  const supabase = getSupabase();
  const ext = file.name.split(".").pop() ?? "bin";
  const filePath = `${taskId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("task-attachments")
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("task_attachments")
    .insert({
      task_id: taskId,
      user_id: userId,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type || "application/octet-stream",
    })
    .select("*, uploader_profile:profiles!task_attachments_user_id_fkey(full_name)")
    .single();

  if (error) throw error;

  await logActivity(taskId, userId, "attachment", null, {
    file_name: file.name,
    attachment_id: data.id,
  });

  return data as TaskAttachment;
}

export async function deleteAttachment(attachmentId: string, filePath: string) {
  const supabase = getSupabase();

  await supabase.storage.from("task-attachments").remove([filePath]);

  const { error } = await supabase
    .from("task_attachments")
    .delete()
    .eq("id", attachmentId);
  if (error) throw error;
}

export function getAttachmentUrl(filePath: string): string {
  const supabase = getSupabase();
  const { data } = supabase.storage.from("task-attachments").getPublicUrl(filePath);
  return data.publicUrl;
}

// ============================================================
// 댓글 / 활동
// ============================================================

export async function addComment(
  taskId: string,
  userId: string,
  content: string
): Promise<TaskActivity> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("task_activities")
    .insert({
      task_id: taskId,
      user_id: userId,
      type: "comment",
      content,
    })
    .select("*, user_profile:profiles!task_activities_user_id_fkey(full_name, avatar_url)")
    .single();

  if (error) throw error;
  return data as TaskActivity;
}

export async function deleteActivity(activityId: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("task_activities")
    .delete()
    .eq("id", activityId);
  if (error) throw error;
}
