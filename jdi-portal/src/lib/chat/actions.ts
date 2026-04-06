import { createClient } from "@/lib/supabase/client";
import type { Channel, Message, MessageReadReceipt, MessageReaction } from "./types";

function getSupabase() {
  return createClient();
}

async function fetchProfileMap(userIds: string[]): Promise<Map<string, { full_name: string; avatar_url: string | null }>> {
  if (userIds.length === 0) return new Map();
  const supabase = getSupabase();
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds);
  return new Map((profiles ?? []).map(p => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]));
}

// ============================================
// 채널 CRUD
// ============================================

export async function createChannel(params: {
  name: string;
  description?: string;
  type?: "group" | "memo";
  memberIds: string[];
  userId: string;
}): Promise<Channel> {
  const supabase = getSupabase();

  // SECURITY DEFINER RPC로 채널 + 멤버 한번에 생성
  const { data: channelId, error } = await supabase.rpc("create_chat_channel", {
    p_name: params.name,
    p_description: params.description ?? "",
    p_type: params.type ?? "group",
    p_member_ids: params.memberIds,
  });

  if (error) throw error;

  // 생성된 채널 조회
  const { data: channel, error: fetchErr } = await supabase
    .from("channels")
    .select("*")
    .eq("id", channelId)
    .single();

  if (fetchErr) throw fetchErr;
  return channel as Channel;
}

export async function updateChannel(
  channelId: string,
  params: { name?: string; description?: string }
): Promise<void> {
  const supabase = getSupabase();
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.name !== undefined) updateData.name = params.name;
  if (params.description !== undefined) updateData.description = params.description;

  const { error } = await supabase.from("channels").update(updateData).eq("id", channelId);
  if (error) throw error;
}

export async function deleteChannel(channelId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("channels").delete().eq("id", channelId);
  if (error) throw error;
}

// ============================================
// 멤버 관리
// ============================================

export async function addMembers(
  channelId: string,
  userIds: string[],
  currentUserName: string
): Promise<void> {
  const supabase = getSupabase();

  const members = userIds.map((id) => ({
    channel_id: channelId,
    user_id: id,
    role: "member",
  }));

  const { error } = await supabase.from("channel_members").insert(members);
  if (error) throw error;

  // 프로필 조회해서 시스템 메시지
  const { data: profiles } = await supabase
    .from("profiles")
    .select("full_name")
    .in("id", userIds);

  const names = (profiles ?? []).map((p) => p.full_name).join(", ");

  await supabase.from("messages").insert({
    channel_id: channelId,
    user_id: (await supabase.auth.getUser()).data.user!.id,
    content: `${currentUserName}님이 ${names}님을 초대했습니다.`,
    type: "system",
  });

  await supabase
    .from("channels")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", channelId);
}

export async function removeMember(
  channelId: string,
  userId: string,
  removedName: string,
  currentUserName: string
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("channel_members")
    .delete()
    .eq("channel_id", channelId)
    .eq("user_id", userId);

  if (error) throw error;

  await supabase.from("messages").insert({
    channel_id: channelId,
    user_id: (await supabase.auth.getUser()).data.user!.id,
    content: `${currentUserName}님이 ${removedName}님을 내보냈습니다.`,
    type: "system",
  });
}

export async function leaveChannel(
  channelId: string,
  userId: string,
  userName: string
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("channel_members")
    .delete()
    .eq("channel_id", channelId)
    .eq("user_id", userId);

  if (error) throw error;

  await supabase.from("messages").insert({
    channel_id: channelId,
    user_id: userId,
    content: `${userName}님이 나갔습니다.`,
    type: "system",
  });
}

// ============================================
// 메시지
// ============================================

export async function sendMessage(params: {
  channelId: string;
  content: string;
  type?: "text" | "file" | "image" | "system";
  parentMessageId?: string;
}): Promise<Message> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("인증이 필요합니다.");

  const { data, error } = await supabase
    .from("messages")
    .insert({
      channel_id: params.channelId,
      user_id: user.id,
      content: params.content,
      type: params.type ?? "text",
      parent_message_id: params.parentMessageId ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  // 프로필 별도 조회
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .single();

  // 채널 updated_at 갱신 (목록 정렬용)
  await supabase
    .from("channels")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.channelId);

  return { ...data, user_profile: profile } as Message;
}

export async function editMessage(messageId: string, content: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("messages")
    .update({
      content,
      is_edited: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", messageId);

  if (error) throw error;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("messages")
    .update({
      is_deleted: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", messageId);

  if (error) throw error;
}

// ============================================
// 메시지 고정
// ============================================

export async function pinMessage(messageId: string): Promise<void> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("인증이 필요합니다.");
  const { error } = await supabase.from("messages").update({
    is_pinned: true, pinned_by: user.id, pinned_at: new Date().toISOString()
  }).eq("id", messageId);
  if (error) throw error;
}

export async function unpinMessage(messageId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("messages").update({
    is_pinned: false, pinned_by: null, pinned_at: null
  }).eq("id", messageId);
  if (error) throw error;
}

export async function getPinnedMessages(channelId: string): Promise<Message[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("messages")
    .select("*").eq("channel_id", channelId).eq("is_pinned", true).eq("is_deleted", false)
    .order("pinned_at", { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) return [];
  const profileMap = await fetchProfileMap([...new Set(data.map(m => m.user_id))]);
  return data.map(m => ({ ...m, user_profile: profileMap.get(m.user_id) })) as Message[];
}

// ============================================
// 읽음 처리
// ============================================

export async function markAsRead(channelId: string): Promise<void> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // 갱신 전 old last_read_at 조회
  const { data: membership } = await supabase
    .from("channel_members")
    .select("last_read_at")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .single();

  const oldLastReadAt = membership?.last_read_at ?? null;

  // last_read_at 갱신
  await supabase
    .from("channel_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);

  // 진짜 안 읽은 메시지만 처리 (oldLastReadAt 이후)
  let query = supabase
    .from("messages")
    .select("id")
    .eq("channel_id", channelId)
    .eq("is_deleted", false)
    .neq("user_id", user.id);

  if (oldLastReadAt) {
    query = query.gt("created_at", oldLastReadAt);
  }

  const { data: unreadMessages } = await query;

  if (!unreadMessages || unreadMessages.length === 0) return;

  const reads = unreadMessages.map((m) => ({
    message_id: m.id,
    user_id: user.id,
  }));

  // upsert로 중복 방지
  await supabase.from("message_reads").upsert(reads, { onConflict: "message_id,user_id" });
}

export async function getReadReceipts(messageId: string): Promise<MessageReadReceipt[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("message_reads")
    .select("user_id, read_at")
    .eq("message_id", messageId)
    .order("read_at", { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const profileMap = await fetchProfileMap(data.map((r) => r.user_id));

  return data.map((r) => {
    const profile = profileMap.get(r.user_id);
    return {
      user_id: r.user_id,
      full_name: profile?.full_name ?? "알 수 없음",
      avatar_url: profile?.avatar_url ?? null,
      read_at: r.read_at,
    };
  });
}

// ============================================
// 메모 채널
// ============================================

export async function ensureMemoChannel(): Promise<Channel> {
  const supabase = getSupabase();

  // 기존 메모 채널 조회
  const { data: existing } = await supabase
    .from("channels")
    .select("*")
    .eq("type", "memo")
    .maybeSingle();

  if (existing) return existing as Channel;

  // 없으면 RPC로 생성
  const { data: channelId, error } = await supabase.rpc("create_chat_channel", {
    p_name: "나만의 메모",
    p_description: "나만 볼 수 있는 개인 메모 공간입니다.",
    p_type: "memo",
    p_member_ids: [],
  });

  if (error) {
    // unique constraint 위반이면 이미 생성된 것 → 다시 조회
    if (error.code === "23505") {
      const { data: retry } = await supabase
        .from("channels")
        .select("*")
        .eq("type", "memo")
        .maybeSingle();
      if (retry) return retry as Channel;
    }
    throw error;
  }

  const { data: channel } = await supabase
    .from("channels")
    .select("*")
    .eq("id", channelId)
    .single();

  return channel as Channel;
}

// ============================================
// 파일 업로드
// ============================================

export async function uploadChatFile(
  channelId: string,
  file: File
): Promise<{ path: string; fileName: string; fileSize: number; fileType: string }> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("인증이 필요합니다.");

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${channelId}/${timestamp}_${safeName}`;

  const { error } = await supabase.storage
    .from("chat-attachments")
    .upload(path, file);

  if (error) throw error;

  return { path, fileName: file.name, fileSize: file.size, fileType: file.type };
}

export async function getChatFileUrl(path: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase.storage
    .from("chat-attachments")
    .createSignedUrl(path, 3600); // 1시간
  return data?.signedUrl ?? null;
}

// ============================================
// 서랍 (사진/파일/링크)
// ============================================

export interface DrawerItem {
  id: string;
  content: string;
  type: string;
  created_at: string;
  user_name: string;
}

export async function getDrawerItems(
  channelId: string,
  tab: "images" | "files" | "links"
): Promise<DrawerItem[]> {
  const supabase = getSupabase();

  if (tab === "links") {
    // 텍스트 메시지 중 URL 포함된 것
    const { data, error } = await supabase
      .from("messages")
      .select("id, content, type, created_at, user_id")
      .eq("channel_id", channelId)
      .eq("type", "text")
      .eq("is_deleted", false)
      .like("content", "%http%")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!data || data.length === 0) return [];

    const profileMap = await fetchProfileMap([...new Set(data.map((m) => m.user_id))]);

    return data.map((m) => ({
      id: m.id,
      content: m.content,
      type: m.type,
      created_at: m.created_at,
      user_name: profileMap.get(m.user_id)?.full_name ?? "",
    }));
  }

  // 이미지 또는 파일 메시지
  const msgType = tab === "images" ? "image" : "file";
  const { data, error } = await supabase
    .from("messages")
    .select("id, content, type, created_at, user_id")
    .eq("channel_id", channelId)
    .eq("type", msgType)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const profileMap = await fetchProfileMap([...new Set(data.map((m) => m.user_id))]);

  return data.map((m) => ({
    id: m.id,
    content: m.content,
    type: m.type,
    created_at: m.created_at,
    user_name: profileMap.get(m.user_id)?.full_name ?? "",
  }));
}

// ============================================
// 메시지 검색
// ============================================

export async function searchMessages(
  channelId: string,
  query: string
): Promise<{ id: string; content: string; created_at: string; user_name: string }[]> {
  const supabase = getSupabase();
  const escaped = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
  const { data, error } = await supabase
    .from("messages")
    .select("id, content, created_at, user_id, type")
    .eq("channel_id", channelId)
    .eq("is_deleted", false)
    .in("type", ["text", "system"])
    .ilike("content", `%${escaped}%`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const profileMap = await fetchProfileMap([...new Set(data.map((m) => m.user_id))]);

  return data.map((m) => ({
    id: m.id,
    content: m.content,
    created_at: m.created_at,
    user_name: profileMap.get(m.user_id)?.full_name ?? "",
  }));
}

// ============================================
// 리액션
// ============================================

export async function toggleReaction(messageId: string, emoji: string): Promise<void> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("인증이 필요합니다.");

  // Check if already reacted
  const { data: existing } = await supabase
    .from("message_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    await supabase.from("message_reactions").delete().eq("id", existing.id);
  } else {
    await supabase.from("message_reactions").insert({ message_id: messageId, user_id: user.id, emoji });
  }
}

export async function getReactions(messageId: string, userId: string): Promise<MessageReaction[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("message_reactions")
    .select("emoji, user_id")
    .eq("message_id", messageId);

  if (!data || data.length === 0) return [];

  const emojiMap = new Map<string, { count: number; reacted: boolean }>();
  for (const r of data) {
    const entry = emojiMap.get(r.emoji) ?? { count: 0, reacted: false };
    entry.count++;
    if (r.user_id === userId) entry.reacted = true;
    emojiMap.set(r.emoji, entry);
  }

  return Array.from(emojiMap.entries()).map(([emoji, { count, reacted }]) => ({ emoji, count, reacted }));
}

// ============================================
// 즐겨찾기
// ============================================

export async function toggleFavorite(channelId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("인증이 필요합니다.");
  const { data: member } = await supabase.from("channel_members")
    .select("is_favorite").eq("channel_id", channelId).eq("user_id", user.id).single();
  const newFav = !(member?.is_favorite ?? false);
  await supabase.from("channel_members").update({ is_favorite: newFav })
    .eq("channel_id", channelId).eq("user_id", user.id);
  return newFav;
}

// ============================================
// 음소거
// ============================================

export async function toggleMute(channelId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("인증이 필요합니다.");

  const { data: member } = await supabase
    .from("channel_members")
    .select("is_muted")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .single();

  const newMuted = !(member?.is_muted ?? false);

  await supabase
    .from("channel_members")
    .update({ is_muted: newMuted })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);

  return newMuted;
}

// ============================================
// 유틸리티
// ============================================

export async function getAllProfiles(): Promise<
  { id: string; full_name: string; avatar_url: string | null; department: string | null }[]
> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, department")
    .eq("is_approved", true)
    .order("full_name");

  if (error) throw error;
  return data ?? [];
}

/**
 * 특정 채널의 멤버 수 조회
 */
export async function getChannelMemberCount(channelId: string): Promise<number> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("channel_members")
    .select("id", { count: "exact", head: true })
    .eq("channel_id", channelId);

  if (error) throw error;
  return count ?? 0;
}

/**
 * 특정 메시지의 읽은 사람 수 조회
 */
export async function getReadCount(messageId: string): Promise<number> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("message_reads")
    .select("id", { count: "exact", head: true })
    .eq("message_id", messageId);

  if (error) throw error;
  return count ?? 0;
}
