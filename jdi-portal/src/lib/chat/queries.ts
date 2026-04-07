import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelWithDetails, Message } from "./types";
import { MESSAGES_PER_PAGE } from "./constants";

/**
 * 사용자가 속한 채널 목록 조회 (마지막 메시지 + 읽지 않은 수 포함)
 */
export async function getChannels(
  supabase: SupabaseClient,
  userId: string
): Promise<ChannelWithDetails[]> {
  // 단일 RPC 호출로 채널 + 마지막 메시지 + 멤버 수 + 안읽은 수 일괄 조회
  const { data, error } = await supabase.rpc("get_user_channels", { p_user_id: userId });
  if (error) throw error;
  if (!data) return [];
  return (data as ChannelWithDetails[]).map((ch) => ({
    ...ch,
    members: [],
  }));
}

/**
 * 채널 상세 조회 (멤버 포함)
 */
export async function getChannelById(
  supabase: SupabaseClient,
  channelId: string
): Promise<ChannelWithDetails | null> {
  const { data: channel, error } = await supabase
    .from("channels")
    .select("*")
    .eq("id", channelId)
    .single();

  if (error || !channel) return null;

  const { data: members } = await supabase
    .from("channel_members")
    .select("*")
    .eq("channel_id", channelId)
    .order("joined_at", { ascending: true });

  // 프로필 별도 조회
  const memberUserIds = (members ?? []).map((m) => m.user_id);
  const { data: memberProfiles } = memberUserIds.length > 0
    ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", memberUserIds)
    : { data: [] };
  const memberProfileMap = new Map(
    (memberProfiles ?? []).map((p) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }])
  );

  return {
    ...channel,
    members: (members ?? []).map((m) => ({
      ...m,
      profile: memberProfileMap.get(m.user_id) ?? null,
    })),
    member_count: members?.length ?? 0,
    last_message: null,
    unread_count: 0,
  } as ChannelWithDetails;
}

/**
 * 메시지 목록 조회 (커서 기반 페이지네이션, 최신순)
 */
export async function getMessages(
  supabase: SupabaseClient,
  channelId: string,
  cursor?: string,
  limit: number = MESSAGES_PER_PAGE
): Promise<Message[]> {
  let query = supabase
    .from("messages")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) throw error;

  const messages = (data ?? []) as Message[];
  if (messages.length === 0) return [];

  // 프로필 별도 조회
  const userIds = [...new Set(messages.map((m) => m.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }])
  );

  const withProfiles = messages.map((m) => ({
    ...m,
    user_profile: profileMap.get(m.user_id) ?? undefined,
  })) as Message[];

  // 시간순으로 뒤집어서 반환 (오래된 것이 위)
  return withProfiles.reverse();
}

/**
 * 메모 채널 조회
 */
export async function getMemoChannel(
  supabase: SupabaseClient,
  userId: string
): Promise<ChannelWithDetails | null> {
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("type", "memo")
    .eq("created_by", userId)
    .single();

  if (error || !data) return null;

  return {
    ...data,
    members: [],
    member_count: 1,
    last_message: null,
    unread_count: 0,
  } as ChannelWithDetails;
}

/**
 * 전체 채널 읽지 않은 메시지 총 합산 (사이드바 뱃지용)
 */
export async function getTotalUnreadCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: memberships } = await supabase
    .from("channel_members")
    .select("channel_id, last_read_at")
    .eq("user_id", userId)
    .eq("is_muted", false);

  if (!memberships || memberships.length === 0) return 0;

  const counts = await Promise.all(
    memberships.map(async (m) => {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", m.channel_id)
        .eq("is_deleted", false)
        .neq("user_id", userId)
        .gt("created_at", m.last_read_at);
      return count ?? 0;
    })
  );
  return counts.reduce((a, b) => a + b, 0);
}
