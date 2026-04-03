import { createClient } from "@/lib/supabase/client";
import type { NotificationType } from "./types";

function getSupabase() {
  return createClient();
}

/** 알림 생성 (실패 시 무시 — fire-and-forget) */
export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = getSupabase();
    await supabase.from("notifications").insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      body: params.body || null,
      link: params.link || null,
      metadata: params.metadata || {},
    });
  } catch {
    // 알림 실패가 본 기능을 중단시키면 안 됨
  }
}

/** 여러 사용자에게 동일 알림 생성 (배치 INSERT) */
export async function createNotificationForMany(
  userIds: string[],
  params: {
    type: NotificationType;
    title: string;
    body?: string;
    link?: string;
    metadata?: Record<string, unknown>;
  }
) {
  if (userIds.length === 0) return;
  try {
    const supabase = getSupabase();
    const rows = userIds.map((userId) => ({
      user_id: userId,
      type: params.type,
      title: params.title,
      body: params.body || null,
      link: params.link || null,
      metadata: params.metadata || {},
    }));
    await supabase.from("notifications").insert(rows);
  } catch {
    // 알림 실패가 본 기능을 중단시키면 안 됨
  }
}

export async function markAsRead(notificationId: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);
  if (error) throw error;
}

export async function markAllAsRead(userId: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
}

export async function deleteNotification(notificationId: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId);
  if (error) throw error;
}
