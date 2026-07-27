import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { NotificationType } from "./types";
import { SETTING_TYPE_MAP } from "./constants";

/**
 * 알림 생성 헬퍼 — **서버 내부 전용**.
 *
 * ⚠️ 이 파일에는 "use server" 를 붙이지 않는다.
 *    "use server" 파일의 export 는 브라우저에서 직접 호출 가능한 HTTP 엔드포인트가 되므로,
 *    호출자 검증이 없는 알림 생성 함수를 그대로 노출하면 승인된 직원 누구나 다른 직원에게
 *    임의의 제목·본문·링크로 알림을 보낼 수 있다(사내 피싱 벡터).
 *    사용자가 직접 호출해도 되는 것(읽음 처리/삭제)만 actions.ts 에 남긴다.
 *
 * 권한의 최종 방어선은 DB 의 insert_notification / insert_notifications_batch RPC
 * (승인 사용자 확인 + 비관리자 type 화이트리스트, 마이그레이션 043) 이다.
 */

/** NotificationType → notification_settings 컬럼명 역방향 조회 */
function getSettingKeyForType(type: NotificationType): string | null {
  for (const [key, types] of Object.entries(SETTING_TYPE_MAP)) {
    if ((types as NotificationType[]).includes(type)) return key;
  }
  return null;
}

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = await createClient();

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
    const supabase = await createClient();

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

/** 오류접수 제출 — 개발자 전원에게 알림 (작성자 제외) */
export async function notifyReportSubmittedInternal(params: {
  reportId: string;
  title: string;
  authorId: string;
}) {
  try {
    const supabase = await createClient();
    const { data: devs } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "developer")
      .neq("id", params.authorId);
    if (!devs || devs.length === 0) return;
    await createNotificationForMany(
      devs.map((d) => d.id),
      {
        type: "report_submitted",
        title: "새 오류접수",
        body: params.title,
        link: `/dashboard/reports`,
      }
    );
  } catch {
    // ignore
  }
}

/** 오류접수 상태 변경 — 작성자에게 알림 (본인이 변경하면 스킵) */
export async function notifyReportStatusChangedInternal(params: {
  reportId: string;
  newStatus: string;
}) {
  try {
    const supabase = await createClient();
    const { data: report } = await supabase
      .from("reports")
      .select("user_id, title")
      .eq("id", params.reportId)
      .single();
    if (!report) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id === report.user_id) return;
    await createNotification({
      userId: report.user_id,
      type: "report_status_changed",
      title: `오류접수가 "${params.newStatus}" 상태로 변경되었습니다`,
      body: report.title,
      link: `/dashboard/reports`,
    });
  } catch {
    // ignore
  }
}
