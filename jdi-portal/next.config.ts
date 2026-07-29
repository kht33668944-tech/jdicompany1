import type { NextConfig } from "next";

/**
 * Content-Security-Policy — 악성 스크립트가 끼어들었을 때 피해를 막는 마지막 그물.
 * Next.js 가 인라인 스크립트/스타일을 쓰므로 'unsafe-inline' 은 유지한다
 * (nonce 방식으로 강화하려면 App Router 미들웨어에서 nonce 를 주입해야 함).
 * connect-src 는 Supabase REST/Auth/Realtime(wss) 경로를 허용한다.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "media-src 'self' blob: https://*.supabase.co",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
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
    // 5분/10분으로 둬서 메뉴를 오갈 때 RSC payload를 재사용 (탭 이동 실측에서
    // 캐시 히트는 10~40ms, 미스는 600~1400ms — 만료가 잦으면 체감이 크게 나빠짐.
    // 대부분 화면은 mount 후 클라이언트에서 최신 데이터를 다시 받으므로 5분 캐시가
    // 오래된 화면을 고정시키지는 않는다.)
    staleTimes: {
      dynamic: 300,
      static: 600,
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
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: CONTENT_SECURITY_POLICY,
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
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
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/sign/**",
      },
    ],
  },
};

export default nextConfig;
