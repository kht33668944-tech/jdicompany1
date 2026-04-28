import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @google/genai (14MB)는 서버에서 require로만 로드 — Next.js 번들에 포함 안 함
  // → Railway 콜드스타트·메모리 사용량 감소
  serverExternalPackages: ["@google/genai"],
  experimental: {
    // 배럴 import 최적화 — phosphor-react(58MB)·recharts·dnd가 쓰는 아이콘/모듈만 골라 번들
    // → 모든 대시보드 페이지의 초기 JS 번들 수백 KB 절감
    optimizePackageImports: [
      "phosphor-react",
      "recharts",
      "@hello-pangea/dnd",
    ],
    // 클라이언트 라우터 캐시 — 방문했던 페이지를 짧은 시간 재사용
    //   dynamic: prefetch={false} 이거나 fully dynamic 한 페이지용 (기본 0초 → 사실상 캐시 없음)
    //   static: prefetch={true} 거나 정적 페이지용 (기본 5분)
    // 30초/3분으로 둬서 메뉴 빠르게 왔다갔다 할 때 즉시 전환 효과
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
