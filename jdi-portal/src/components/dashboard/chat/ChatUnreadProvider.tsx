"use client";

import { useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getTotalUnreadCount } from "@/lib/chat/queries";
import { showDesktopNotification } from "@/lib/notifications/desktop";

interface ChatUnreadProviderProps {
  userId: string;
  onUnreadChange: (count: number) => void;
}

interface MembershipInfo {
  channel_id: string;
  is_muted: boolean;
}

const FETCH_DEDUP_MS = 300;

export default function ChatUnreadProvider({ userId, onUnreadChange }: ChatUnreadProviderProps) {
  const pathname = usePathname();
  const isChatPage = pathname?.startsWith("/dashboard/chat");
  const membershipsRef = useRef<Map<string, MembershipInfo>>(new Map());
  const lastFetchRef = useRef(0);

  // 짧은 시간 내 중복 호출 합치기 (markAsRead → chat:read + channel_members postgres_changes 동시 발사)
  const fetchUnread = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < FETCH_DEDUP_MS) return;
    lastFetchRef.current = now;
    try {
      const count = await getTotalUnreadCount(createClient(), userId);
      onUnreadChange(count);
    } catch {
      // 실패 시 무시
    }
  }, [userId, onUnreadChange]);

  const loadMemberships = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("channel_members")
        .select("channel_id, is_muted")
        .eq("user_id", userId);
      const map = new Map<string, MembershipInfo>();
      for (const row of data ?? []) {
        map.set(row.channel_id, { channel_id: row.channel_id, is_muted: row.is_muted ?? false });
      }
      membershipsRef.current = map;
    } catch {
      // 실패 시 빈 캐시 유지
    }
  }, [userId]);

  // 초기 로드 — unread 1회 + 멤버십 캐시 1회
  useEffect(() => {
    fetchUnread();
    loadMemberships();
  }, [fetchUnread, loadMemberships]);

  // markAsRead 직후 사이드바 뱃지 즉시 갱신 (realtime 지연 우회)
  useEffect(() => {
    const handler = () => { fetchUnread(); };
    window.addEventListener("chat:read", handler);
    return () => window.removeEventListener("chat:read", handler);
  }, [fetchUnread]);

  // 멤버십 변경 감지 — 채널 추가/제거/뮤트 토글 등에만 반응
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("chat:membership-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channel_members", filter: `user_id=eq.${userId}` },
        () => {
          loadMemberships();
          fetchUnread();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, loadMemberships, fetchUnread]);

  // 채팅 페이지에서는 ChatPageClient 가 메시지 INSERT 를 직접 처리하므로
  // 여기서 별도 구독을 띄우지 않는다 — 동일 이벤트 2회 처리 회피
  useEffect(() => {
    if (isChatPage) return;
    const supabase = createClient();
    const channel = supabase
      .channel("chat:unread-badge")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          const newMsg = payload.new as {
            id: string;
            channel_id: string;
            user_id: string;
            content: string;
            type: string;
            is_deleted: boolean;
          };

          if (newMsg.user_id === userId) return;
          if (newMsg.type === "system" || newMsg.is_deleted) return;

          const membership = membershipsRef.current.get(newMsg.channel_id);
          if (!membership) return;

          fetchUnread();

          if (membership.is_muted) return;

          const [{ data: profile }, { data: channelInfo }] = await Promise.all([
            supabase.from("profiles").select("full_name").eq("id", newMsg.user_id).single(),
            supabase.from("channels").select("name, type").eq("id", newMsg.channel_id).single(),
          ]);

          const senderName = profile?.full_name ?? "누군가";
          const channelName = channelInfo?.name ?? "채팅";
          if (channelInfo?.type === "memo") return;

          const bodyText =
            newMsg.type === "image"
              ? "사진을 보냈습니다."
              : newMsg.type === "file"
                ? "파일을 보냈습니다."
                : newMsg.content;

          toast.info(`${senderName} (${channelName})`, {
            description: bodyText,
            duration: 4000,
            action: {
              label: "보기",
              onClick: () => {
                window.location.href = `/dashboard/chat/${newMsg.channel_id}`;
              },
            },
          });

          showDesktopNotification({
            title: `${senderName} (${channelName})`,
            body: bodyText,
            link: `/dashboard/chat/${newMsg.channel_id}`,
            tag: `chat-msg:${newMsg.id}`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchUnread, isChatPage]);

  return null;
}
