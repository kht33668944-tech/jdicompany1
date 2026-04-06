import { createClient } from "@/lib/supabase/client";
import type { NotificationType } from "./types";
import { SETTING_TYPE_MAP } from "./constants";

function getSupabase() {
  return createClient();
}

/** NotificationType → notification_settings 컬럼명 역방향 조회 */
function getSettingKeyForType(type: NotificationType): string | null {
  for (const [key, types] of Object.entries(SETTING_TYPE_MAP)) {
    if ((types as NotificationType[]).includes(type)) return key;
  }
  return null;
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

    // 수신자의 알림 설정 확인
    const settingKey = getSettingKeyForType(params.type);
    if (settingKey) {
      const { data: settings } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("user_id", params.userId)
        .single();
      if (settings && (settings as unknown as Record<string, unknown>)[settingKey] === false) return;
    }

    await supabase.rpc("insert_notification", {
      p_user_id: params.userId,
      p_type: params.type,
      p_title: params.title,
      p_body: params.body || null,
      p_link: params.link || null,
      p_metadata: params.metadata || {},
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

    // 수신자들의 알림 설정 확인 후 비활성화된 사용자 필터링
    const settingKey = getSettingKeyForType(params.type);
    let filteredUserIds = userIds;
    if (settingKey) {
      const { data: allSettings } = await supabase
        .from("notification_settings")
        .select("*")
        .in("user_id", userIds);
      if (allSettings && allSettings.length > 0) {
        const disabledSet = new Set(
          allSettings
            .filter((s) => (s as unknown as Record<string, unknown>)[settingKey] === false)
            .map((s) => s.user_id)
        );
        filteredUserIds = userIds.filter((uid) => !disabledSet.has(uid));
      }
    }

    if (filteredUserIds.length === 0) return;

    const notifications = filteredUserIds.map((userId) => ({
      user_id: userId,
      type: params.type,
      title: params.title,
      body: params.body || null,
      link: params.link || null,
      metadata: params.metadata || {},
    }));
    await supabase.rpc("insert_notifications_batch", {
      p_notifications: notifications,
    });
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
