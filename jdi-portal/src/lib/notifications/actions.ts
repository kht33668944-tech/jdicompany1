import { createClient } from "@/lib/supabase/client";
import { SETTING_TYPE_MAP } from "./constants";
import type { NotificationType } from "./types";

function getSupabase() {
  return createClient();
}

/** 사용자의 알림 설정을 확인하여 해당 타입 알림 수신 여부 반환 */
async function shouldNotify(
  userId: string,
  type: NotificationType
): Promise<boolean> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return true; // 설정 없으면 기본 활성화

  for (const [settingKey, types] of Object.entries(SETTING_TYPE_MAP)) {
    if (types.includes(type)) {
      return data[settingKey] as boolean;
    }
  }
  return true;
}

/** 알림 생성 (설정 확인 후 INSERT, 실패 시 무시) */
export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const allowed = await shouldNotify(params.userId, params.type);
    if (!allowed) return;

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

/** 여러 사용자에게 동일 알림 생성 */
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
  await Promise.all(
    userIds.map((userId) => createNotification({ userId, ...params }))
  );
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
