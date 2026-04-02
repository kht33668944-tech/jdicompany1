import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TaskWithDetails,
  TaskChecklistItem,
  TaskAttachment,
  TaskActivity,
  TaskAssignee,
} from "./types";

const TASK_BASE_SELECT = `
  id, title, description, status, priority, category,
  due_date, start_date, position, parent_id, created_by,
  created_at, updated_at,
  creator_profile:profiles!tasks_created_by_fkey(full_name, avatar_url)
`;

function getCompletedCutoff(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

async function fetchAssigneesForTasks(
  supabase: SupabaseClient,
  taskIds: string[]
): Promise<Map<string, TaskAssignee[]>> {
  if (taskIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("task_assignees")
    .select("task_id, user_id, profiles(full_name, avatar_url)")
    .in("task_id", taskIds);

  if (error) throw error;

  const map = new Map<string, TaskAssignee[]>();
  for (const row of data ?? []) {
    const profile = row.profiles as unknown as { full_name: string; avatar_url: string | null } | null;
    const assignee: TaskAssignee = {
      user_id: row.user_id,
      full_name: profile?.full_name ?? "",
      avatar_url: profile?.avatar_url ?? null,
    };
    if (!map.has(row.task_id)) map.set(row.task_id, []);
    map.get(row.task_id)!.push(assignee);
  }
  return map;
}

async function fetchCountsForTasks(
  supabase: SupabaseClient,
  taskIds: string[]
): Promise<{
  comments: Map<string, number>;
  attachments: Map<string, number>;
  subtasks: Map<string, number>;
  checklist: Map<string, { total: number; completed: number }>;
}> {
  if (taskIds.length === 0) {
    return {
      comments: new Map(),
      attachments: new Map(),
      subtasks: new Map(),
      checklist: new Map(),
    };
  }

  const [commentResult, attachmentResult, subtaskResult, checklistResult] = await Promise.all([
    supabase
      .from("task_activities")
      .select("task_id")
      .in("task_id", taskIds)
      .eq("type", "comment"),
    supabase
      .from("task_attachments")
      .select("task_id")
      .in("task_id", taskIds),
    supabase
      .from("tasks")
      .select("parent_id")
      .in("parent_id", taskIds),
    supabase.rpc("get_task_checklist_stats", { p_task_ids: taskIds }),
  ]);

  const comments = new Map<string, number>();
  for (const row of commentResult.data ?? []) {
    comments.set(row.task_id, (comments.get(row.task_id) ?? 0) + 1);
  }

  const attachments = new Map<string, number>();
  for (const row of attachmentResult.data ?? []) {
    attachments.set(row.task_id, (attachments.get(row.task_id) ?? 0) + 1);
  }

  const subtasks = new Map<string, number>();
  for (const row of subtaskResult.data ?? []) {
    if (row.parent_id) {
      subtasks.set(row.parent_id, (subtasks.get(row.parent_id) ?? 0) + 1);
    }
  }

  const checklist = new Map<string, { total: number; completed: number }>();
  for (const row of checklistResult.data ?? []) {
    checklist.set(row.task_id, {
      total: Number(row.total),
      completed: Number(row.completed),
    });
  }

  return { comments, attachments, subtasks, checklist };
}

function enrichTasks(
  rawTasks: Record<string, unknown>[],
  assigneeMap: Map<string, TaskAssignee[]>,
  counts: Awaited<ReturnType<typeof fetchCountsForTasks>>
): TaskWithDetails[] {
  return rawTasks.map((raw) => {
    const id = raw.id as string;
    const cl = counts.checklist.get(id);
    return {
      ...(raw as unknown as TaskWithDetails),
      assignees: assigneeMap.get(id) ?? [],
      checklist_total: cl?.total ?? 0,
      checklist_completed: cl?.completed ?? 0,
      subtask_count: counts.subtasks.get(id) ?? 0,
      comment_count: counts.comments.get(id) ?? 0,
      attachment_count: counts.attachments.get(id) ?? 0,
    };
  });
}

export async function getTasksWithDetails(supabase: SupabaseClient): Promise<TaskWithDetails[]> {
  const [activeResult, completedResult] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_BASE_SELECT)
      .in("status", ["대기", "진행중"])
      .order("position", { ascending: true }),
    supabase
      .from("tasks")
      .select(TASK_BASE_SELECT)
      .eq("status", "완료")
      .gte("updated_at", getCompletedCutoff())
      .order("position", { ascending: true }),
  ]);

  if (activeResult.error) throw activeResult.error;
  if (completedResult.error) throw completedResult.error;

  const allRaw = [...(activeResult.data ?? []), ...(completedResult.data ?? [])];
  const taskIds = allRaw.map((t) => t.id as string);

  const [assigneeMap, counts] = await Promise.all([
    fetchAssigneesForTasks(supabase, taskIds),
    fetchCountsForTasks(supabase, taskIds),
  ]);

  return enrichTasks(allRaw, assigneeMap, counts);
}

export async function getTaskById(supabase: SupabaseClient, id: string): Promise<TaskWithDetails | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_BASE_SELECT)
    .eq("id", id)
    .single();

  if (error) return null;

  const [assigneeMap, counts] = await Promise.all([
    fetchAssigneesForTasks(supabase, [id]),
    fetchCountsForTasks(supabase, [id]),
  ]);

  return enrichTasks([data], assigneeMap, counts)[0];
}

export async function getSubtasks(supabase: SupabaseClient, parentId: string): Promise<TaskWithDetails[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_BASE_SELECT)
    .eq("parent_id", parentId)
    .order("position", { ascending: true });

  if (error) throw error;
  const taskIds = (data ?? []).map((t) => t.id as string);

  const [assigneeMap, counts] = await Promise.all([
    fetchAssigneesForTasks(supabase, taskIds),
    fetchCountsForTasks(supabase, taskIds),
  ]);

  return enrichTasks(data ?? [], assigneeMap, counts);
}

export async function getChecklistItems(
  supabase: SupabaseClient,
  taskId: string
): Promise<TaskChecklistItem[]> {
  const { data, error } = await supabase
    .from("task_checklist_items")
    .select("*")
    .eq("task_id", taskId)
    .order("position", { ascending: true });

  if (error) throw error;
  return (data as TaskChecklistItem[]) ?? [];
}

export async function getAttachments(
  supabase: SupabaseClient,
  taskId: string
): Promise<TaskAttachment[]> {
  const { data, error } = await supabase
    .from("task_attachments")
    .select("*, uploader_profile:profiles!task_attachments_user_id_fkey(full_name)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as TaskAttachment[]) ?? [];
}

export async function getActivities(
  supabase: SupabaseClient,
  taskId: string
): Promise<TaskActivity[]> {
  const { data, error } = await supabase
    .from("task_activities")
    .select("*, user_profile:profiles!task_activities_user_id_fkey(full_name, avatar_url)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as TaskActivity[]) ?? [];
}

export async function getMaxPosition(supabase: SupabaseClient, status: string): Promise<number> {
  const { data } = await supabase
    .from("tasks")
    .select("position")
    .eq("status", status)
    .order("position", { ascending: false })
    .limit(1)
    .single();
  return data?.position ?? 0;
}
