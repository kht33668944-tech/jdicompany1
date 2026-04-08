import { createServerClient } from "@supabase/ssr";
import type { AuthError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7일 (초 단위)

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

  const { data: { user }, error: authError } = await supabase.auth.getUser();

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
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/api/keep-warm")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
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
