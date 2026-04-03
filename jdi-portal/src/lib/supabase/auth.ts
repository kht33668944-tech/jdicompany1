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
 * layout + page에서 여러 번 호출해도 실제 Supabase 호출은 1회만 발생.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getProfile(supabase, user.id);
  if (!profile) return null;

  return { user, profile, supabase };
});
