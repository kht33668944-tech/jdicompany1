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
    if (permission === "denied") {
      // 이미 브라우저/기기 설정에서 이 사이트 알림이 차단된 상태 → 요청창이 뜨지 않으므로
      // 사용자가 직접 풀어야 한다. 어디를 눌러야 하는지까지 안내한다.
      throw new Error(
        "이 브라우저에서 알림이 차단되어 있어요. 주소창 왼쪽 자물쇠(🔒) 아이콘 → ‘알림’ → ‘허용’으로 바꾼 뒤 다시 눌러주세요. (아이폰은 홈 화면에 앱을 설치한 뒤 사용할 수 있어요.)"
      );
    }
    // permission === "default": 허용 창을 그냥 닫았거나 아직 선택하지 않은 경우
    throw new Error("알림 허용 창에서 ‘허용’을 눌러야 알림이 켜집니다. 다시 한 번 눌러주세요.");
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
