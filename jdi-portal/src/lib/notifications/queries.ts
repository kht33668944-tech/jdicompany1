import type { SupabaseClient } from "@supabase/supabase-js";
import type { Notification } from "./types";

/** 30일 이상된 알림 자동 삭제 (조회 시 함께 실행) */
async function cleanupOldNotifications(supabase: SupabaseClient, userId: string) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("notifications")
    .delete()
    .eq("user_id", userId)
    .lt("created_at", cutoff);
}

export async function getNotifications(
  supabase: SupabaseClient,
  userId: string,
  options?: { limit?: number; unreadOnly?: boolean }
): Promise<Notification[]> {
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 50);

  if (options?.unreadOnly) {
    query = query.eq("is_read", false);
  }

  // 오래된 알림 정리 (fire-and-forget)
  cleanupOldNotifications(supabase, userId).catch(() => {});

  const { data, error } = await query;
  if (error) throw error;
  return (data as Notification[]) ?? [];
}

export async function getUnreadCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) throw error;
  return count ?? 0;
}
