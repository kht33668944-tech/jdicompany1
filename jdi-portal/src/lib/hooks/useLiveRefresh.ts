"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { NOTIFICATION_RECEIVED_EVENT } from "@/lib/notifications/constants";

// 이 시간이 지나면 화면 데이터를 오래된 것으로 보고 다시 불러온다
const STALE_AFTER_MS = 60_000;
// Realtime 알림이 유실돼도 화면이 보이는 동안 이 주기로 신선도를 검사한다
const STALE_CHECK_INTERVAL_MS = 180_000;
// router.refresh() 가 네트워크 문제로 끝을 알리지 못해도
// 이 시간이 지나면 다시 갱신을 시도할 수 있다 (갱신이 영구히 막히는 것 방지)
const REFRESH_IN_FLIGHT_TIMEOUT_MS = 15_000;
// 알림이 연달아 도착하면 이 시간 안의 것들을 모아 한 번만 갱신한다
const NOTIFICATION_COALESCE_MS = 2_000;

/**
 * 서버 렌더 데이터로 그려지는 화면을 로그아웃 없이 최신으로 유지한다.
 *
 * - 알림(Realtime) 도착: 보이는 화면이면 잠깐 모아서 갱신, 안 보이면 서버를
 *   부르지 않고 "오래됨"만 표시해 두었다가 다시 보일 때 한 번에 갱신한다.
 * - 창 포커스 복귀·마운트 직후·주기 검사: 페이로드가 오래됐으면 갱신한다.
 *   (마운트 검사는 라우터 캐시 staleTimes 가 되살린 오래된 화면 대비)
 *
 * loadedAt 은 서버가 페이로드를 만든 시각(Date.now())이다.
 */
export function useLiveRefresh(loadedAt: number): void {
  const router = useRouter();
  const loadedAtRef = useRef(loadedAt);
  const inFlightAtRef = useRef(0);

  useEffect(() => {
    loadedAtRef.current = loadedAt;
    inFlightAtRef.current = 0;
  }, [loadedAt]);

  useEffect(() => {
    let notifyTimer: number | null = null;

    const refreshNow = () => {
      if (Date.now() - inFlightAtRef.current < REFRESH_IN_FLIGHT_TIMEOUT_MS) return;
      inFlightAtRef.current = Date.now();
      router.refresh();
    };
    const refreshIfStale = () => {
      if (Date.now() - loadedAtRef.current < STALE_AFTER_MS) return;
      refreshNow();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
    const handleNotification = () => {
      if (document.visibilityState !== "visible") {
        loadedAtRef.current = 0;
        return;
      }
      if (notifyTimer !== null) return;
      notifyTimer = window.setTimeout(() => {
        notifyTimer = null;
        if (document.visibilityState === "visible") refreshNow();
        else loadedAtRef.current = 0;
      }, NOTIFICATION_COALESCE_MS);
    };

    refreshIfStale();
    const staleCheckTimer = window.setInterval(handleVisibilityChange, STALE_CHECK_INTERVAL_MS);

    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(NOTIFICATION_RECEIVED_EVENT, handleNotification);
    return () => {
      if (notifyTimer !== null) window.clearTimeout(notifyTimer);
      window.clearInterval(staleCheckTimer);
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(NOTIFICATION_RECEIVED_EVENT, handleNotification);
    };
  }, [router]);
}
