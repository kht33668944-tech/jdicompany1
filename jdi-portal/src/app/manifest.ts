import type { MetadataRoute } from "next";

/**
 * PWA 매니페스트 (Next.js 16 파일 컨벤션)
 * - 크롬/엣지에서 "앱 설치" 버튼이 활성화되도록 192/512 PNG 아이콘 제공
 * - display: "standalone" → 설치 후 주소창 없는 독립 창
 * - 한국어 환경 기본
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JDICOMPANY 사내 포털",
    short_name: "JDI 포털",
    description: "JDICOMPANY 내부 시스템 포털 — 근태, 할일, 채팅, 일정",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    lang: "ko-KR",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
