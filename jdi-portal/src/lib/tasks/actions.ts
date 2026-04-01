import { createClient } from "@/lib/supabase/client";
import { TASK_PRIORITIES, TASK_STATUSES } from "./constants";
import type { TaskPriority, TaskStatus } from "./types";

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

export async function createTask(params: {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: string;
  dueDate?: string;
  createdBy: string;
  assignedTo?: string;
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
      position: nextPosition,
      created_by: params.createdBy,
      assigned_to: params.assignedTo || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTask(
  taskId: string,
  params: {
    title?: string;
    description?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    category?: string | null;
    dueDate?: string | null;
    assignedTo?: string | null;
  }
) {
  const supabase = getSupabase();
  const { data: currentTask, error: currentTaskError } = await supabase
    .from("tasks")
    .select("status")
    .eq("id", taskId)
    .single();

  if (currentTaskError) throw currentTaskError;

  if (params.status !== undefined && params.status !== currentTask.status) {
    const nextPosition = await getNextPosition(supabase, params.status);
    await moveTask(taskId, params.status, nextPosition);
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.title !== undefined) updateData.title = params.title;
  if (params.description !== undefined) updateData.description = params.description;
  if (params.priority !== undefined) updateData.priority = params.priority;
  if (params.category !== undefined) updateData.category = params.category;
  if (params.dueDate !== undefined) updateData.due_date = params.dueDate;
  if (params.assignedTo !== undefined) updateData.assigned_to = params.assignedTo;

  if (Object.keys(updateData).length === 1) {
    return currentTask;
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(updateData)
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
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

export async function addComment(taskId: string, userId: string, content: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, user_id: userId, content })
    .select("*, profiles(full_name)")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteComment(commentId: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from("task_comments").delete().eq("id", commentId);
  if (error) throw error;
}
