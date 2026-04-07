import { cache } from "react";
import { createClient } from "./server";
import { getProfile } from "../attendance/queries";
import type { Profile } from "../attendance/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface AuthUser {
  user: User;
  profile: Profile;
  supabase: SupabaseClient;
}

/**
 * 요청 단위로 캐싱되는 인증 헬퍼.
 * - 미들웨어(proxy.ts)에서 이미 `auth.getUser()` 로 JWT 검증 + 필요시 토큰 갱신 완료
 * - 여기서는 `auth.getSession()` 으로 **로컬 쿠키 디코드만** 수행 → 네트워크 0회
 *   (Supabase 공식 SSR 권장 패턴: middleware verifies, server components read session)
 * - layout + page에서 여러 번 호출해도 React cache() 로 1회만 실행
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const profile = await getProfile(supabase, user.id);
  if (!profile) return null;

  return { user, profile, supabase };
});
