"use client";

import { useEffect } from "react";

/**
 * 클라이언트 마운트 시 Service Worker 등록.
 * - 프로덕션 환경에서만 등록 (개발 중 캐시 문제 방지)
 * - 등록 실패는 조용히 무시 (PWA 미지원 브라우저 호환)
 */
export default function PWAInit() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          /* SW 등록 실패 — 일반 웹 사이트로 동작 */
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
