"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChannelWithDetails } from "@/lib/chat/types";

export function useChannelMetaSync(
  setChannels: React.Dispatch<React.SetStateAction<ChannelWithDetails[]>>,
  setSelectedChannel: React.Dispatch<React.SetStateAction<ChannelWithDetails | undefined>>,
  channelsRef: React.MutableRefObject<ChannelWithDetails[]>,
) {
  // 채널 메타(이름/설명) 실시간 동기화
  useEffect(() => {
    const supabase = createClient();
    const sub = supabase
      .channel("chat:channels-meta")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "channels" },
        (payload) => {
          const updated = payload.new as { id: string; name: string; description: string; updated_at: string };
          setChannels((prev) =>
            prev.map((ch) =>
              ch.id === updated.id
                ? { ...ch, name: updated.name, description: updated.description, updated_at: updated.updated_at }
                : ch
            )
          );
          setSelectedChannel((prev) =>
            prev && prev.id === updated.id
              ? { ...prev, name: updated.name, description: updated.description, updated_at: updated.updated_at }
              : prev
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [setChannels, setSelectedChannel]);

  // 멤버 수 변동 동기화
  useEffect(() => {
    const supabase = createClient();
    const refreshMemberCount = async (channelId: string) => {
      if (!channelsRef.current.some((ch) => ch.id === channelId)) return;
      const { count } = await supabase
        .from("channel_members")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", channelId);
      const next = count ?? 0;
      setChannels((prev) =>
        prev.map((ch) => (ch.id === channelId ? { ...ch, member_count: next } : ch))
      );
      setSelectedChannel((prev) =>
        prev && prev.id === channelId ? { ...prev, member_count: next } : prev
      );
    };

    const sub = supabase
      .channel("chat:member-count-sync")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "channel_members" },
        (payload) => refreshMemberCount((payload.new as { channel_id: string }).channel_id)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "channel_members" },
        (payload) => refreshMemberCount((payload.old as { channel_id: string }).channel_id)
      )
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [setChannels, setSelectedChannel, channelsRef]);
}
