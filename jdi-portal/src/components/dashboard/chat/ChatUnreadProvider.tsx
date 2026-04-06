"use client";

import { useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getTotalUnreadCount } from "@/lib/chat/queries";

interface ChatUnreadProviderProps {
  userId: string;
  onUnreadChange: (count: number) => void;
}

export default function ChatUnreadProvider({ userId, onUnreadChange }: ChatUnreadProviderProps) {
  const pathname = usePathname();
  const isChatPage = pathname?.startsWith("/dashboard/chat");

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

  // 초기 로드
  useEffect(() => {
    fetchUnread();
  }, [fetchUnread]);

  // Realtime 구독: 새 메시지 → unread 재계산
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
        (payload) => {
          const newMsg = payload.new as { user_id: string };
          // 내가 보낸 메시지는 무시
          if (newMsg.user_id === userId) return;
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
