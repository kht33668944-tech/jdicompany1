import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 클라이언트 라우터 캐시 — 방문했던 페이지를 짧은 시간 재사용
  //   dynamic: prefetch={false} 이거나 fully dynamic 한 페이지용 (기본 0초 → 사실상 캐시 없음)
  //   static: prefetch={true} 거나 정적 페이지용 (기본 5분)
  // 30초/3분으로 둬서 메뉴 빠르게 왔다갔다 할 때 즉시 전환 효과
  experimental: {
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
