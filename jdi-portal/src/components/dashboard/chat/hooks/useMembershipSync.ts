"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { getChannelById } from "@/lib/chat/queries";
import type { ChannelWithDetails } from "@/lib/chat/types";

export function useMembershipSync(
  userId: string,
  setChannels: React.Dispatch<React.SetStateAction<ChannelWithDetails[]>>,
  selectedChannelRef: React.MutableRefObject<ChannelWithDetails | undefined>,
  setSelectedChannel: (ch: ChannelWithDetails | undefined) => void,
  setMobileShowChat: (show: boolean) => void,
  setMutedChannels: React.Dispatch<React.SetStateAction<Set<string>>>,
  setFavoriteChannels: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
  useEffect(() => {
    const supabase = createClient();
    const subscription = supabase
      .channel(`chat:memberships:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "channel_members",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const newMember = payload.new as { channel_id: string };
          let exists = false;
          setChannels((prev) => {
            exists = prev.some((ch) => ch.id === newMember.channel_id);
            return prev;
          });
          if (exists) return;
          const full = await getChannelById(supabase, newMember.channel_id);
          if (!full) return;
          setChannels((prev) => {
            if (prev.some((ch) => ch.id === full.id)) return prev;
            return [full, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "channel_members",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const removed = payload.old as { channel_id: string };
          setChannels((prev) => prev.filter((ch) => ch.id !== removed.channel_id));
          if (selectedChannelRef.current?.id === removed.channel_id) {
            setSelectedChannel(undefined);
            setMobileShowChat(false);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "channel_members",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { channel_id: string; is_muted: boolean; is_favorite: boolean };
          setMutedChannels((prev) => {
            const next = new Set(prev);
            if (row.is_muted) next.add(row.channel_id);
            else next.delete(row.channel_id);
            return next;
          });
          setFavoriteChannels((prev) => {
            const next = new Set(prev);
            if (row.is_favorite) next.add(row.channel_id);
            else next.delete(row.channel_id);
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [userId, setChannels, selectedChannelRef, setSelectedChannel, setMobileShowChat, setMutedChannels, setFavoriteChannels]);
}
