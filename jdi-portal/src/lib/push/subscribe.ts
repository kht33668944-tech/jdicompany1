import { VAPID_PUBLIC_KEY, SW_PATH, urlBase64ToUint8Array } from "./constants";
import { savePushSubscription, deletePushSubscription } from "./actions";

export type PushSupport = "ok" | "no-sw" | "no-push" | "no-notification" | "no-vapid";

/** 현재 환경이 Web Push를 지원하는지 + VAPID 키가 주입됐는지 확인 */
export function checkPushSupport(): PushSupport {
  if (typeof window === "undefined") return "no-sw";
  if (!("serviceWorker" in navigator)) return "no-sw";
  if (!("PushManager" in window)) return "no-push";
  if (!("Notification" in window)) return "no-notification";
  if (!VAPID_PUBLIC_KEY) return "no-vapid";
  return "ok";
}

/** 현재 브라우저에 활성 subscription이 있는지 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (checkPushSupport() !== "ok") return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/** 권한 요청. "granted" | "denied" | "default" 반환 */
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

/**
 * 권한 요청 → SW 등록 확인 → subscribe → DB 저장.
 * 실패 시 throw. 이미 구독되어 있으면 그 subscription을 다시 DB에 upsert만 한다.
 */
export async function subscribeToPush(userId: string): Promise<PushSubscription> {
  const support = checkPushSupport();
  if (support !== "ok") {
    throw new Error(`푸시를 지원하지 않는 환경입니다 (${support})`);
  }

  const permission = await requestPushPermission();
  if (permission !== "granted") {
    throw new Error("알림 권한이 거부되었습니다.");
  }

  // SW 등록 (이미 등록되어 있으면 그대로 사용)
  let reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!reg) {
    reg = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;
  }

  // 기존 subscription 재사용 또는 신규
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
    });
  }

  const json = sub.toJSON();
  await savePushSubscription(userId, {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    userAgent: navigator.userAgent,
  });

  return sub;
}

/** 로컬 unsubscribe + DB DELETE */
export async function unsubscribeFromPush(userId: string): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await deletePushSubscription(userId, endpoint);
}
