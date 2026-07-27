"use client";

import { useSyncExternalStore } from "react";

/**
 * 지금 화면이 데스크톱 앱(jdi-desktop) 안에서 열렸는지 여부.
 *
 * 데스크톱 앱의 preload 가 window.jdiDesktop 을 심어준다. 일반 브라우저에는 없다.
 * 서버 렌더링 시에는 false 로 두고, 화면이 붙은 뒤 실제 값으로 맞춘다(값이 변하지 않아 구독 불필요).
 */
const noopSubscribe = () => () => {};

export function useIsDesktopApp(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () =>
      (window as unknown as { jdiDesktop?: { isDesktopApp?: boolean } }).jdiDesktop?.isDesktopApp === true,
    () => false
  );
}
