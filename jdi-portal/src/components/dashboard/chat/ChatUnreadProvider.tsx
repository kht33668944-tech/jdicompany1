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
const INITIAL_FETCH_DELAY_MS = 10000;

export default function ChatUnreadProvider({ userId, onUnreadChange }: ChatUnreadProviderProps) {
  const pathname = usePathname();
  const isChatPage = pathname?.startsWith("/dashboard/chat");
  const membershipsRef = useRef<Map<string, MembershipInfo>>(new Map());
  const lastFetchRef = useRef(0);

  const fetchUnread = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < FETCH_DEDUP_MS) return;
    lastFetchRef.current = now;
    try {
      const count = await getTotalUnreadCount(createClient(), userId);
      onUnreadChange(count);
    } catch {
      // Badge count is non-critical.
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
      // Keep the previous cache when the background request fails.
    }
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchUnread();
      loadMemberships();
    }, INITIAL_FETCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [fetchUnread, loadMemberships]);

  useEffect(() => {
    const handler = () => {
      fetchUnread();
    };
    window.addEventListener("chat:read", handler);
    return () => window.removeEventListener("chat:read", handler);
  }, [fetchUnread]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const timer = window.setTimeout(() => {
      channel = supabase
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
    }, INITIAL_FETCH_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, loadMemberships, fetchUnread]);

  useEffect(() => {
    if (isChatPage) return;

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const timer = window.setTimeout(() => {
      channel = supabase
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

            const senderName = profile?.full_name ?? "알 수 없음";
            const channelName = channelInfo?.name ?? "채팅";
            if (channelInfo?.type === "memo") return;

            const bodyText =
              newMsg.type === "image"
                ? "사진을 보냈습니다"
                : newMsg.type === "file"
                  ? "파일을 보냈습니다"
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
    }, INITIAL_FETCH_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, fetchUnread, isChatPage]);

  return null;
}
