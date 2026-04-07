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

export default function ChatUnreadProvider({ userId, onUnreadChange }: ChatUnreadProviderProps) {
  const pathname = usePathname();
  const isChatPage = pathname?.startsWith("/dashboard/chat");
  const membershipsRef = useRef<Map<string, MembershipInfo>>(new Map());

  const fetchUnread = useCallback(async () => {
    // 채팅 페이지에 있을 때는 ChatPageClient가 직접 관리
    if (isChatPage) return;
    try {
      const count = await getTotalUnreadCount(createClient(), userId);
      onUnreadChange(count);
    } catch {
      // 실패 시 무시
    }
  }, [userId, onUnreadChange, isChatPage]);

  // 채널 멤버십/음소거 상태 캐시 로드
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

  // 초기 로드
  useEffect(() => {
    fetchUnread();
    loadMemberships();
  }, [fetchUnread, loadMemberships]);

  // 멤버십 변경 감지: channel_members 변경 시 캐시 새로고침
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("chat:membership-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channel_members", filter: `user_id=eq.${userId}` },
        () => { loadMemberships(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, loadMemberships]);

  // Realtime 구독: 새 메시지 → unread 재계산 + 토스트 + OS 알림
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

          // 내가 보낸 메시지는 무시
          if (newMsg.user_id === userId) return;
          // 시스템 메시지/삭제 메시지 무시
          if (newMsg.type === "system" || newMsg.is_deleted) return;

          // 내가 속한 채널인지 + 음소거 여부 확인 (캐시 사용)
          const membership = membershipsRef.current.get(newMsg.channel_id);
          if (!membership) return; // 멤버 아니면 무시
          if (membership.is_muted) {
            // 음소거여도 unread count는 갱신 (배지 정확도 유지)
            fetchUnread();
            return;
          }

          // 발신자 + 채널 이름 병렬 조회
          const [{ data: profile }, { data: channelInfo }] = await Promise.all([
            supabase.from("profiles").select("full_name").eq("id", newMsg.user_id).single(),
            supabase.from("channels").select("name, type").eq("id", newMsg.channel_id).single(),
          ]);

          const senderName = profile?.full_name ?? "누군가";
          const channelName = channelInfo?.name ?? "채팅";
          const isMemo = channelInfo?.type === "memo";

          // 본인 메모 채널은 알림 불필요 (본인 메시지는 위에서 이미 차단됨)
          if (isMemo) {
            fetchUnread();
            return;
          }

          const bodyText =
            newMsg.type === "image"
              ? "사진을 보냈습니다."
              : newMsg.type === "file"
                ? "파일을 보냈습니다."
                : newMsg.content;

          // 토스트
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

          // OS 네이티브 알림
          showDesktopNotification({
            title: `${senderName} (${channelName})`,
            body: bodyText,
            link: `/dashboard/chat/${newMsg.channel_id}`,
            tag: `chat-msg:${newMsg.id}`,
          });

          // 배지 업데이트
          fetchUnread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchUnread, isChatPage]);

  return null; // 렌더링 없음
}
