/**
 * 브라우저 Web Notifications API 래퍼.
 * Windows/Mac/Linux에서 OS 네이티브 알림 센터로 표시됨.
 *
 * 사용법:
 *   if (getDesktopPermission() === "default") await requestDesktopPermission();
 *   showDesktopNotification({ title, body, link });
 *
 * 모든 함수는 SSR-safe (window 체크) 이며, 미지원/거부 환경에서는 silent no-op.
 */

import { SW_PATH } from "@/lib/push/constants";

export type DesktopPermission = "default" | "granted" | "denied" | "unsupported";

const STORAGE_KEY = "jdi:desktop-notification-prompted";
const ENABLED_KEY = "jdi:desktop-notification-enabled";
const ENABLED_CHANGE_EVENT = "jdi:desktop-notification-enabled-change";

/**
 * 사용자의 로컬 토글 상태 (기본 true). 브라우저 권한이 있어도 이 값이 false면 알림 표시 안 함.
 */
export function isDesktopEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(ENABLED_KEY) !== "0";
}

export function setDesktopEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent(ENABLED_CHANGE_EVENT, { detail: { enabled } }));
}

export function onDesktopEnabledChange(handler: (enabled: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ enabled: boolean }>).detail;
    handler(detail?.enabled ?? true);
  };
  window.addEventListener(ENABLED_CHANGE_EVENT, listener);
  return () => window.removeEventListener(ENABLED_CHANGE_EVENT, listener);
}

export function isDesktopSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * 이 기기가 웹푸시 구독 중인지 (동기 조회용 캐시).
 *
 * 화면이 보이지 않는 동안 오는 알림은 서비스워커(웹푸시)가 대신 띄운다.
 * 그때 페이지에서도 띄우면 같은 메시지로 Windows 알림이 2개 뜬다.
 * `showDesktopNotification`은 동기 함수라 매번 조회할 수 없어 값을 캐시해 두고,
 * 화면 표시 상태가 바뀔 때마다(=구독을 켜고 끈 직후 포함) 다시 확인한다.
 */
let pushSubscribed = false;

function refreshPushSubscribed(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker
    .getRegistration(SW_PATH)
    .then((reg) => reg?.pushManager.getSubscription() ?? null)
    .then((sub) => {
      pushSubscribed = sub !== null;
    })
    .catch(() => {
      pushSubscribed = false;
    });
}

if (typeof window !== "undefined") {
  refreshPushSubscribed();
  document.addEventListener("visibilitychange", refreshPushSubscribed);
}

export function getDesktopPermission(): DesktopPermission {
  if (!isDesktopSupported()) return "unsupported";
  return window.Notification.permission as DesktopPermission;
}

/**
 * 권한 요청 (사용자 액션에서 호출해야 브라우저가 허용함).
 * @returns 최종 권한 상태
 */
export async function requestDesktopPermission(): Promise<DesktopPermission> {
  if (!isDesktopSupported()) return "unsupported";
  try {
    const result = await window.Notification.requestPermission();
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
    return result as DesktopPermission;
  } catch {
    return "denied";
  }
}

export function hasBeenPrompted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

interface ShowOptions {
  title: string;
  body?: string | null;
  /** 클릭 시 이동할 URL (앱 내부 또는 외부) */
  link?: string | null;
  /** 동일 tag로 그룹핑하여 중복 표시 방지 (예: 채널 ID) */
  tag?: string;
  /** 사용자 상호작용 전까지 자동으로 닫히지 않게 (지원 브라우저에서) */
  requireInteraction?: boolean;
  /** 알림 아이콘 URL — 기본값: /favicon.ico */
  icon?: string;
}

/**
 * OS 네이티브 알림 표시. 권한이 없으면 silent no-op.
 * 알림 클릭 시 윈도우에 포커스 + link가 있으면 해당 페이지로 이동.
 */
export function showDesktopNotification(opts: ShowOptions): void {
  if (!isDesktopSupported()) return;
  if (window.Notification.permission !== "granted") return;
  // 사용자가 로컬 토글로 꺼둔 경우 skip
  if (!isDesktopEnabled()) return;

  // 화면이 안 보이는 동안(최소화·다른 탭·백그라운드)에는 웹푸시가 같은 알림을 띄운다.
  // 여기서도 띄우면 알림이 2개가 되므로 푸시 구독이 있는 기기에서는 양보한다.
  // 데스크톱 앱은 웹푸시를 쓰지 않아 pushSubscribed 가 false → 항상 표시된다.
  if (pushSubscribed && document.visibilityState === "hidden") return;

  // 데스크톱 앱(jdi-desktop) 안이라면 앱 본체가 알림을 띄우게 맡긴다.
  // 웹에서 직접 띄우면 Windows 알림에 앱 이름이 "Electron" 으로 표시되기 때문.
  // 브라우저에는 window.jdiDesktop 이 없으므로 아래 기본 경로를 그대로 탄다.
  const desktopBridge = (window as unknown as {
    jdiDesktop?: { notify?: (payload: { title: string; body?: string | null; link?: string | null }) => void };
  }).jdiDesktop;
  if (desktopBridge?.notify) {
    try {
      desktopBridge.notify({ title: opts.title, body: opts.body, link: opts.link });
      return;
    } catch {
      // 실패하면 아래 브라우저 기본 경로로 넘어간다
    }
  }

  try {
    // renotify는 TS lib에 없지만 대부분 브라우저가 지원 — 옵셔널 필드로 캐스팅
    const options = {
      body: opts.body ?? undefined,
      icon: opts.icon ?? "/favicon.ico",
      tag: opts.tag,
      requireInteraction: opts.requireInteraction ?? false,
      ...(opts.tag ? { renotify: true } : {}),
    } as NotificationOptions;
    const notification = new window.Notification(opts.title, options);

    notification.onclick = (event) => {
      event.preventDefault();
      try {
        // 데스크톱 앱(jdi-desktop)에서는 트레이로 숨겨진 창을 먼저 되살린다.
        // 브라우저에는 window.jdiDesktop 이 없으므로 그대로 건너뛴다.
        (window as unknown as { jdiDesktop?: { showWindow?: () => void } }).jdiDesktop?.showWindow?.();
        window.focus();
      } catch {
        /* noop */
      }
      if (opts.link) {
        // 같은 origin의 내부 링크면 SPA 라우팅, 외부면 새 탭
        const isInternal = opts.link.startsWith("/") || opts.link.startsWith(window.location.origin);
        if (isInternal) {
          window.location.href = opts.link;
        } else {
          window.open(opts.link, "_blank", "noopener,noreferrer");
        }
      }
      notification.close();
    };
  } catch {
    // Safari 등 일부 환경에서 생성 실패 시 silent
  }
}
