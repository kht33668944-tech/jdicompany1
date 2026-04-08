import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAllProfiles } from "./queries";
import type { Profile } from "./types";

/** 요청 단위 캐싱 — 같은 렌더에서 여러 번 호출해도 1회만 실행 */
export const getCachedAllProfiles = cache(async (): Promise<Profile[]> => {
  const supabase = await createClient();
  return getAllProfiles(supabase);
});
