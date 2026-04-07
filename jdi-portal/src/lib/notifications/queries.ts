import type { SupabaseClient } from "@supabase/supabase-js";
import type { Notification } from "./types";

/**
 * 30일 이상된 알림 정리.
 * - 별도 함수로 분리: 자주 호출되는 getNotifications 안에서 매번 DELETE 가 발생하던 문제 제거
 * - 호출 주체: 관리 cron / 사용자 메뉴 / 세션 시작 등 빈도 낮은 곳에서 명시적으로 호출
 */
export async function cleanupOldNotifications(supabase: SupabaseClient, userId: string) {
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
