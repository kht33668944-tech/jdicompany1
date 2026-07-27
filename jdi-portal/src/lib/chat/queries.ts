import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelWithDetails, Message } from "./types";
import { MESSAGES_PER_PAGE } from "./constants";
import { collectMessageFilePaths, signChatFilePaths } from "./fileUrlBatch";

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
    .select("id, name, description, type, created_by, created_at, updated_at, dm_pair_key")
    .eq("id", channelId)
    .single();

  if (error || !channel) return null;

  const { data: members } = await supabase
    .from("channel_members")
    .select("id, channel_id, user_id, role, last_read_at, joined_at")
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
 * - 단일 RPC 호출: 메시지 + 프로필 임베드 한 번에 (이전: messages + profiles 2 round-trip)
 */
export async function getMessages(
  supabase: SupabaseClient,
  channelId: string,
  cursor?: string,
  limit: number = MESSAGES_PER_PAGE
): Promise<Message[]> {
  const { data, error } = await supabase.rpc("get_channel_messages", {
    p_channel_id: channelId,
    p_cursor: cursor ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  return (data as Message[] | null) ?? [];
}

/**
 * 초기 메시지의 첨부 서명 URL을 **서버에서 미리** 일괄 발급한다.
 *
 * 기존 흐름: SSR(메시지) → 브라우저 렌더 → 서버 액션 왕복(URL 발급) → 그제서야 이미지 로드 시작.
 *            채팅방을 열 때마다 사진이 한 박자 늦게 뜨는 원인이었다.
 * 변경 흐름: SSR 단계에서 URL 까지 실어 보내 브라우저는 받자마자 이미지를 로드한다.
 *
 * - 첨부가 없는 채널은 스토리지 호출 자체를 하지 않는다(왕복 0).
 * - 실패해도 예외를 던지지 않는다. 빈 값을 주면 클라이언트의 기존 배치 경로가 그대로
 *   이어받아 URL을 발급하므로 화면이 깨지지 않는다(느려질 뿐).
 */
export async function getMessageFileUrls(
  supabase: SupabaseClient,
  messages: Message[]
): Promise<Record<string, string>> {
  const paths = collectMessageFilePaths(messages);
  if (paths.length === 0) return {};

  try {
    return await signChatFilePaths(supabase, paths);
  } catch (error) {
    console.warn("[chat] 초기 첨부 URL 프리페치 실패 — 클라이언트 경로로 폴백합니다.", error);
    return {};
  }
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
    .select("id, name, description, type, created_by, created_at, updated_at, dm_pair_key")
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
 * - 단일 RPC 호출 (이전: 채널 수만큼 N+1 쿼리)
 */
export async function getTotalUnreadCount(
  supabase: SupabaseClient
): Promise<number> {
  const { data, error } = await supabase.rpc("get_total_unread_count");
  if (error) return 0;
  return (data as number | null) ?? 0;
}
