import { createClient } from "@/lib/supabase/client";

export async function openOrCreateDm(targetUserId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("open_or_create_dm", {
    p_target_user_id: targetUserId,
  });
  if (error) throw error;
  if (!data || typeof data !== "string") {
    throw new Error("대화방을 열지 못했습니다.");
  }
  return data;
}
