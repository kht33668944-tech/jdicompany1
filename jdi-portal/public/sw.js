/* JDI 포털 Service Worker
 * 수동 작성 — Next.js 16 + Turbopack 호환
 *
 * 캐싱 전략:
 *  - 정적 자산 (/_next/static, 폰트, 이미지): cache-first (변경되면 새 URL 이라 안전)
 *  - 페이지 (HTML/Next.js RSC): network-first (5초 타임아웃, 실패 시 캐시 → /offline)
 *  - 그 외 (API, Supabase): 네트워크만 (캐시 안 함)
 *
 * 캐시 버전: 코드 변경 시 CACHE_VERSION 을 올리면 구버전 자동 삭제
 */

const CACHE_VERSION = "jdi-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;
const OFFLINE_URL = "/offline";

// 설치 시 오프라인 페이지 미리 캐시
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES_CACHE);
      try {
        await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      } catch {
        /* offline 페이지가 아직 빌드 안 된 환경에서도 install 은 성공해야 함 */
      }
      await self.skipWaiting();
    })()
  );
});

// 활성화 시 구버전 캐시 삭제
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      // navigation preload 활성화 (지원하는 브라우저에서 페이지 응답 가속)
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })()
  );
});

// 정적 자산 판정 — Next.js 빌드 산출물 + public/ 의 이미지/폰트
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    /\.(?:js|css|woff2?|ttf|otf|eot|png|jpg|jpeg|gif|svg|ico|webp|avif)$/i.test(
      url.pathname
    )
  );
}

// 캐시하지 않을 경로 — 동적 데이터, 인증, 서드파티
function isNoCache(url, request) {
  if (request.method !== "GET") return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/auth/")) return true;
  // Supabase 등 외부 호스트는 SW 가 가로채지 않음 (origin 다르면 fetch 가 알아서)
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // 외부 origin 은 패스
  if (url.origin !== self.location.origin) return;
  if (isNoCache(url, request)) return;

  // 정적 자산: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch {
          return cached ?? Response.error();
        }
      })()
    );
    return;
  }

  // 페이지/네비게이션: network-first → 실패 시 캐시 → 오프라인 페이지
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES_CACHE);
        try {
          // navigation preload 응답이 있으면 우선 사용
          const preload = await event.preloadResponse;
          if (preload) {
            cache.put(request, preload.clone());
            return preload;
          }
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch {
          const cached = await cache.match(request);
          if (cached) return cached;
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ??
            new Response("오프라인 상태입니다.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })()
    );
  }
});
