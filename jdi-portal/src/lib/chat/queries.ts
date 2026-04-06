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
  // 내가 속한 채널 ID 목록
  const { data: memberships, error: memErr } = await supabase
    .from("channel_members")
    .select("channel_id, last_read_at")
    .eq("user_id", userId);

  if (memErr) throw memErr;
  if (!memberships || memberships.length === 0) return [];

  const channelIds = memberships.map((m) => m.channel_id);
  const lastReadMap = new Map(memberships.map((m) => [m.channel_id, m.last_read_at]));

  // 채널 정보 조회
  const { data: channels, error: chErr } = await supabase
    .from("channels")
    .select("*")
    .in("id", channelIds)
    .order("updated_at", { ascending: false });

  if (chErr) throw chErr;
  if (!channels) return [];

  // 마지막 메시지, 읽지 않은 수, 멤버 수를 모두 병렬 조회
  type LastMsg = { channel_id: string; content: string; created_at: string; type: string; user_id: string };
  const lastMsgMap = new Map<string, LastMsg>();
  const unreadCounts = new Map<string, number>();
  const memberCountMap = new Map<string, number>();

  await Promise.all([
    // 각 채널의 마지막 메시지 (채널당 1개씩 병렬)
    Promise.all(channelIds.map(async (chId) => {
      const { data } = await supabase
        .from("messages")
        .select("channel_id, content, created_at, type, user_id")
        .eq("channel_id", chId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (data) lastMsgMap.set(chId, data as LastMsg);
    })),
    // 각 채널의 읽지 않은 메시지 수 (병렬)
    Promise.all(channelIds.map(async (channelId) => {
      const lastRead = lastReadMap.get(channelId);
      if (!lastRead) return;
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", channelId)
        .eq("is_deleted", false)
        .neq("user_id", userId)
        .gt("created_at", lastRead);
      unreadCounts.set(channelId, count ?? 0);
    })),
    // 각 채널의 멤버 수
    supabase
      .from("channel_members")
      .select("channel_id")
      .in("channel_id", channelIds)
      .then(({ data: memberCounts }) => {
        for (const m of memberCounts ?? []) {
          memberCountMap.set(m.channel_id, (memberCountMap.get(m.channel_id) ?? 0) + 1);
        }
      }),
  ]);

  // 마지막 메시지 작성자 프로필
  const userIds = new Set<string>();
  for (const msg of lastMsgMap.values()) {
    if (msg) userIds.add(msg.user_id);
  }
  const profileMap = new Map<string, string>();
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(userIds));
    for (const p of profiles ?? []) {
      profileMap.set(p.id, p.full_name);
    }
  }

  return channels.map((ch) => {
    const lastMsg = lastMsgMap.get(ch.id);
    return {
      ...ch,
      members: [],
      member_count: memberCountMap.get(ch.id) ?? 0,
      last_message: lastMsg
        ? {
            content: lastMsg.content,
            created_at: lastMsg.created_at,
            user_name: profileMap.get(lastMsg.user_id) ?? "",
            type: lastMsg.type,
          }
        : null,
      unread_count: unreadCounts.get(ch.id) ?? 0,
    } as ChannelWithDetails;
  });
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
