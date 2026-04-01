import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskWithProfile, TaskComment } from "./types";

const TASK_SELECT = `
  *,
  assigned_profile:profiles!tasks_assigned_to_fkey(full_name),
  creator_profile:profiles!tasks_created_by_fkey(full_name)
`;

function getCompletedCutoff(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

export async function getAllTasks(supabase: SupabaseClient): Promise<TaskWithProfile[]> {
  // 대기/진행중: 전부, 완료: 최근 7일만
  const [activeResult, completedResult] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_SELECT)
      .in("status", ["대기", "진행중"])
      .order("position", { ascending: true }),
    supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("status", "완료")
      .gte("updated_at", getCompletedCutoff())
      .order("position", { ascending: true }),
  ]);
  return [
    ...((activeResult.data as TaskWithProfile[]) ?? []),
    ...((completedResult.data as TaskWithProfile[]) ?? []),
  ];
}

export async function getMyTasks(supabase: SupabaseClient, userId: string): Promise<TaskWithProfile[]> {
  const [activeResult, completedResult] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("assigned_to", userId)
      .in("status", ["대기", "진행중"])
      .order("position", { ascending: true }),
    supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("assigned_to", userId)
      .eq("status", "완료")
      .gte("updated_at", getCompletedCutoff())
      .order("position", { ascending: true }),
  ]);
  return [
    ...((activeResult.data as TaskWithProfile[]) ?? []),
    ...((completedResult.data as TaskWithProfile[]) ?? []),
  ];
}

export async function getTaskComments(supabase: SupabaseClient, taskId: string): Promise<TaskComment[]> {
  const { data } = await supabase
    .from("task_comments")
    .select("*, profiles(full_name)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  return (data as TaskComment[]) ?? [];
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
