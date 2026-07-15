import { createServerClient } from "@supabase/ssr";
import type { AuthError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7일 (초 단위)

/**
 * 인증 검증 결과 캐시 — 성능 계측 결과 모든 요청(페이지 이동·prefetch 포함)이
 * Supabase 인증 서버(서울)로 나가는 getUser() 왕복에 평시 300~500ms,
 * 동시 요청 폭주 시 2~4초를 지불하고 있었다(사이트 전역 지연의 최대 단일 원인).
 *
 * 동일한 인증 쿠키로 최근(5분 내) 네트워크 검증에 성공했다면 재검증을 생략한다.
 * - 캐시에 넣는 것은 "GoTrue 가 실제로 검증해준 쿠키"뿐이므로 위조 토큰은
 *   캐시 미스 → 네트워크 검증 → 거부된다.
 * - 토큰 만료 2분 전부터는 캐시를 무시하고 네트워크 경로로 보내 세션 갱신을 맡긴다.
 * - 트레이드오프: 강제 로그아웃/세션 철회가 최대 5분 늦게 반영된다(사내 도구 수용 범위).
 */
const AUTH_CACHE_TTL_MS = 5 * 60_000;
const TOKEN_EXP_MARGIN_MS = 2 * 60_000;
const AUTH_CACHE_MAX_ENTRIES = 200;

interface AuthCacheEntry {
  expiresAtMs: number;
  verifiedAtMs: number;
}

type AuthCacheGlobal = typeof globalThis & {
  __jdiAuthVerifyCache?: Map<string, AuthCacheEntry>;
};

function getAuthVerifyCache(): Map<string, AuthCacheEntry> {
  const g = globalThis as AuthCacheGlobal;
  return (g.__jdiAuthVerifyCache ??= new Map());
}

/** sb-* 인증 쿠키 전체를 정렬·직렬화해 캐시 키로 쓴다(쿠키가 바뀌면 키도 바뀜). */
function getAuthCookieKey(request: NextRequest): string | null {
  const parts = request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith("sb-"))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((cookie) => `${cookie.name}=${cookie.value}`);
  return parts.length > 0 ? parts.join(";") : null;
}

function withPersistentMaxAge(
  name: string,
  options: { maxAge?: number; [key: string]: unknown } | undefined
) {
  // Supabase 인증 쿠키(sb-*)에만 적용. 그 외 쿠키는 원본 옵션 유지.
  if (!name.startsWith("sb-")) return options;
  // 이미 maxAge가 지정돼 있으면 존중
  if (options && typeof options.maxAge === "number") return options;
  return { ...(options ?? {}), maxAge: SESSION_MAX_AGE };
}

// Supabase 인증 에러가 "일시 오류"인지 판정.
// - AuthRetryableFetchError: SDK가 네트워크/일시 오류로 태깅한 canonical 클래스
// - status >= 500: 서버 일시 장애 (4xx 는 영구 오류라 절대 포함하지 않음)
// 메시지 문자열 매칭은 SDK 버전이 바뀌면 false-positive 위험이 있어 의도적으로 제외.
function isTransientError(error: AuthError | null): boolean {
  if (!error) return false;
  if (error.name === "AuthRetryableFetchError") return true;
  if (typeof error.status === "number" && error.status >= 500) return true;
  return false;
}

export async function updateSession(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/health") {
    return NextResponse.next({ request });
  }
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, withPersistentMaxAge(name, options))
          );
        },
      },
    }
  );

  // 1) 캐시 확인 — 동일 쿠키가 최근 네트워크 검증을 통과했으면 재검증 생략
  const cookieKey = getAuthCookieKey(request);
  const cache = getAuthVerifyCache();
  const nowMs = Date.now();
  if (cookieKey) {
    const cached = cache.get(cookieKey);
    if (
      cached &&
      nowMs - cached.verifiedAtMs < AUTH_CACHE_TTL_MS &&
      nowMs < cached.expiresAtMs - TOKEN_EXP_MARGIN_MS
    ) {
      // 인증된 사용자의 /login·/signup 접근은 대시보드로
      if (
        request.nextUrl.pathname.startsWith("/login") ||
        request.nextUrl.pathname.startsWith("/signup")
      ) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }
  }

  // 2) 네트워크 검증 — Supabase 인증 서버 왕복(+ 필요 시 토큰 갱신)
  const authStartedAt = Date.now();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  const authMs = Date.now() - authStartedAt;
  if (authMs >= 300) {
    console.info("[stage]", {
      route: request.nextUrl.pathname,
      stage: "middleware.getUser",
      ms: authMs,
    });
  }

  // 3) 검증 성공 시 캐시에 기록 — 만료 시각은 세션(로컬 쿠키 디코드)에서 읽는다
  if (user && cookieKey) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.expires_at) {
      if (cache.size >= AUTH_CACHE_MAX_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
      }
      cache.set(cookieKey, {
        expiresAtMs: session.expires_at * 1000,
        verifiedAtMs: nowMs,
      });
    }
  }

  // 네트워크 일시 오류는 "로그아웃"으로 취급하지 않음 — 기존 쿠키/세션 그대로 통과
  const isTransientAuthError = isTransientError(authError);

  // 로그인하지 않은 사용자가 보호된 경로에 접근하면 로그인 페이지로 리다이렉트
  if (
    !user &&
    !isTransientAuthError &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/signup") &&
    !request.nextUrl.pathname.startsWith("/forgot-password") &&
    !request.nextUrl.pathname.startsWith("/reset-password") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // 원래 가려던 경로 보존 (pathname + search)
    const originalPath = request.nextUrl.pathname + request.nextUrl.search;
    if (originalPath && originalPath !== "/") {
      url.searchParams.set("next", originalPath);
    }
    return NextResponse.redirect(url);
  }

  // 로그인한 사용자가 로그인/회원가입 페이지 접근 시 대시보드로 리다이렉트
  if (
    user &&
    (request.nextUrl.pathname.startsWith("/login") ||
      request.nextUrl.pathname.startsWith("/signup"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
