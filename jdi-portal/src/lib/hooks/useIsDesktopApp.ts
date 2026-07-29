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
  return useSyncExternalStore(noopSubscribe, isDesktopAppNow, () => false);
}

function isDesktopAppNow(): boolean {
  const bridged = (window as unknown as { jdiDesktop?: { isDesktopApp?: boolean } })
    .jdiDesktop?.isDesktopApp;
  if (bridged === true) return true;

  // preload 브리지가 없는 구버전 앱 대비 — Electron 런타임 자체를 확인한다.
  // 이게 없으면 구버전 앱에서 브라우저용 화면이 떠서 웹푸시 구독을 시도하고,
  // Electron 에는 푸시 서비스가 없어 "push service not available" 오류가 난다.
  // 일반 브라우저 UA 에는 "Electron/" 이 들어가지 않는다.
  return /\bElectron\//.test(window.navigator.userAgent);
}
