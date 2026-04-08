"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Service Worker 의 notificationclick 핸들러가 보내는 postMessage 수신.
 * sw.js 에서 `client.navigate()` 가 차단되는 환경(WebAPK 등)을 위한 폴백.
 */
export default function NavigationListener() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "NAVIGATE") return;
      const link = data.link;
      if (typeof link !== "string") return;
      // 내부 경로만 허용
      if (!link.startsWith("/")) return;
      if (link.startsWith("//") || link.startsWith("/\\")) return;
      router.push(link);
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handler);
    };
  }, [router]);

  return null;
}
