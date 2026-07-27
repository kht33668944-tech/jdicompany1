"use server";

import { createClient } from "@/lib/supabase/server";
import {
  notifyReportSubmittedInternal,
  notifyReportStatusChangedInternal,
} from "./internal";

/**
 * ⚠️ 이 파일의 export 는 브라우저에서 직접 호출 가능한 엔드포인트가 된다.
 *    따라서 "누가 호출해도 안전한 것"만 둔다. 임의의 사용자에게 임의 내용으로 알림을
 *    만드는 createNotification / createNotificationForMany 는 서버 내부 전용이므로
 *    ./internal.ts 에 있다(브라우저에서 호출 불가).
 */

async function requireSessionUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Not authenticated");
  return session.user.id;
}

/** 오류접수 제출 알림 — 작성자는 세션에서 결정한다(클라이언트 값 신뢰 금지). */
export async function notifyReportSubmitted(params: { reportId: string; title: string }) {
  const authorId = await requireSessionUserId();
  await notifyReportSubmittedInternal({
    reportId: params.reportId,
    title: params.title,
    authorId,
  });
}

/** 오류접수 상태 변경 알림 */
export async function notifyReportStatusChanged(params: {
  reportId: string;
  newStatus: string;
}) {
  await requireSessionUserId();
  await notifyReportStatusChangedInternal(params);
}

/** 알림 읽음 처리 — 세션 사용자 본인의 알림만 */
export async function markAsRead(notificationId: string) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", session.user.id);
  if (error) throw error;
}

/** 모든 알림 읽음 처리 — 세션 사용자 본인 것만 */
export async function markAllAsRead() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", session.user.id)
    .eq("is_read", false);
  if (error) throw error;
}

/** 알림 삭제 — 세션 사용자 본인의 알림만 */
export async function deleteNotification(notificationId: string) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", session.user.id);
  if (error) throw error;
}
