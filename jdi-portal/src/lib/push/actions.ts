import { createClient } from "@/lib/supabase/client";

function getSupabase() {
  return createClient();
}

export interface SubscriptionPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

/**
 * 같은 endpoint가 이미 있으면 무시 (UNIQUE 제약). 새 endpoint면 INSERT.
 */
export async function savePushSubscription(
  userId: string,
  payload: SubscriptionPayload
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: payload.endpoint,
        p256dh: payload.p256dh,
        auth: payload.auth,
        user_agent: payload.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" }
    );
  if (error) throw error;
}

export async function deletePushSubscription(
  userId: string,
  endpoint: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
  if (error) throw error;
}

/**
 * 채팅방 보고 있다는 신호를 5초 주기로 호출.
 * RPC가 last_seen_at = NOW() 갱신.
 */
export async function touchChannelSeen(channelId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.rpc("touch_channel_seen", { p_channel_id: channelId });
}
