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

export type DesktopPermission = "default" | "granted" | "denied" | "unsupported";

const STORAGE_KEY = "jdi:desktop-notification-prompted";

export function isDesktopSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
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
