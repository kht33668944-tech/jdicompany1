import { cache } from "react";
import { createClient } from "./server";
import { getProfile } from "../attendance/queries";
import { getPool, isPostgresUsable, markPostgresUnavailable } from "@/lib/db/postgres";
import type { Profile } from "../attendance/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface AuthUser {
  user: User;
  profile: Profile;
  supabase: SupabaseClient;
}

async function getProfileViaPostgres(userId: string): Promise<Profile | null> {
  if (!isPostgresUsable()) return null;

  const { rows } = await getPool().query(
    "select * from public.profiles where id = $1 limit 1",
    [userId]
  );
  return (rows[0] as Profile | undefined) ?? null;
}

/**
 * 요청 단위로 캐싱되는 인증 헬퍼.
 * - 미들웨어(proxy.ts)에서 이미 `auth.getUser()` 로 JWT 검증 + 필요시 토큰 갱신 완료
 * - 여기서는 `auth.getSession()` 으로 **로컬 쿠키 디코드만** 수행 → 네트워크 0회
 *   (Supabase 공식 SSR 권장 패턴: middleware verifies, server components read session)
 * - layout + page에서 여러 번 호출해도 React cache() 로 1회만 실행
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const startedAt = Date.now();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  let profile: Profile | null = null;
  try {
    profile = await getProfileViaPostgres(user.id);
  } catch (error) {
    markPostgresUnavailable();
    console.error("[auth] postgres profile lookup failed, falling back:", error);
  }

  profile ??= await getProfile(supabase, user.id);
  if (!profile) return null;

  // 콜드 지연 추적: 세션 읽기 + 프로필 조회 합산 시간
  const ms = Date.now() - startedAt;
  if (ms >= 300) {
    console.info("[stage]", { route: "(auth)", stage: "getAuthUser", ms });
  }

  return { user, profile, supabase };
});

/**
 * 관리자 전용 서버 액션 진입부.
 * `getAuthUser()` 가 이미 요청 단위로 캐싱한 프로필의 role 만 확인하므로
 * 별도의 profiles 재조회(네트워크 왕복)가 없다.
 */
export async function requireAdminUser(): Promise<AuthUser> {
  const auth = await getAuthUser();
  if (!auth) throw new Error("로그인이 필요합니다.");
  if (auth.profile.role !== "admin") throw new Error("관리자 권한이 필요합니다.");
  return auth;
}
