"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getMessages as fetchMessages, getChannelById } from "@/lib/chat/queries";
import { ensureMemoChannel, markAsRead } from "@/lib/chat/actions";
import type { ChannelWithDetails, Message, Channel } from "@/lib/chat/types";
import ChannelList from "./ChannelList";
import ChatRoom from "./ChatRoom";
import EmptyState from "./EmptyState";
import ChannelCreateModal from "./ChannelCreateModal";
import ChannelSettingsDrawer from "./ChannelSettingsDrawer";

interface ChatPageClientProps {
  initialChannels: ChannelWithDetails[];
  initialChannel?: ChannelWithDetails;
  initialMessages?: Message[];
  userId: string;
  userName: string;
  userAvatar?: string | null;
}

export default function ChatPageClient({
  initialChannels,
  initialChannel,
  initialMessages,
  userId,
  userName,
}: ChatPageClientProps) {
  const [channels, setChannels] = useState<ChannelWithDetails[]>(initialChannels);
  const [selectedChannel, setSelectedChannel] = useState<ChannelWithDetails | undefined>(
    initialChannel
  );
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(!!initialChannel);
  const [mutedChannels, setMutedChannels] = useState<Set<string>>(new Set());
  const [favoriteChannels, setFavoriteChannels] = useState<Set<string>>(new Set());
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  const selectedChannelRef = useRef(selectedChannel);
  selectedChannelRef.current = selectedChannel;
  const mutedChannelsRef = useRef(mutedChannels);
  mutedChannelsRef.current = mutedChannels;

  // Ensure memo channel exists on mount
  useEffect(() => {
    ensureMemoChannel()
      .then((memoChannel) => {
        setChannels((prev) => {
          const alreadyPresent = prev.some((ch) => ch.id === memoChannel.id);
          if (alreadyPresent) return prev;
          const withDetails: ChannelWithDetails = {
            ...memoChannel,
            members: [],
            member_count: 1,
            last_message: null,
            unread_count: 0,
          };
          return [withDetails, ...prev];
        });
      })
      .catch(() => {});
  }, [userId]);

  // 음소거 채널 목록 로드
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("channel_members")
      .select("channel_id, is_muted, is_favorite")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (data) {
          setMutedChannels(new Set(data.filter((d) => d.is_muted).map((d) => d.channel_id)));
          setFavoriteChannels(new Set(data.filter((d) => d.is_favorite).map((d) => d.channel_id)));
        }
      });
  }, [userId]);

  // Presence: 온라인 사용자 추적
  useEffect(() => {
    const supabase = createClient();
    const presenceChannel = supabase.channel("presence:online");

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState<{ user_id: string }>();
        const onlineIds = new Set<string>();
        for (const presences of Object.values(state)) {
          for (const p of presences) {
            onlineIds.add(p.user_id);
          }
        }
        setOnlineUsers(onlineIds);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ user_id: userId });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [userId]);

  // Global realtime subscription for new messages
  useEffect(() => {
    const supabase = createClient();
    const realtimeChannel = supabase
      .channel("chat:global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const newMsg = payload.new as Message;

          const { data } = await supabase
            .from("messages")
            .select("*")
            .eq("id", newMsg.id)
            .single();

          if (data) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, avatar_url")
              .eq("id", data.user_id)
              .single();
            data.user_profile = profile;
          }

          const fullMsg = data as Message | null;
          if (!fullMsg) return;

          const currentSelected = selectedChannelRef.current;

          // Skip processing if message is for the currently selected channel
          // (ChatRoom's own filtered handler already processes it)
          if (currentSelected?.id === fullMsg.channel_id) {
            // Only clear unread count for current channel
            if (fullMsg.user_id !== userId) {
              setChannels((prev) =>
                prev.map((ch) =>
                  ch.id === fullMsg.channel_id ? { ...ch, unread_count: 0 } : ch
                )
              );
            }
            return;
          }

          // Update channel list
          setChannels((prev) =>
            prev
              .map((ch) => {
                if (ch.id !== fullMsg.channel_id) return ch;
                return {
                  ...ch,
                  unread_count:
                    fullMsg.user_id !== userId ? ch.unread_count + 1 : ch.unread_count,
                  last_message: {
                    content: fullMsg.content,
                    created_at: fullMsg.created_at,
                    user_name: fullMsg.user_profile?.full_name ?? userName,
                    type: fullMsg.type,
                  },
                  updated_at: fullMsg.created_at,
                };
              })
              .sort((a, b) => {
                if (a.type === "memo") return -1;
                if (b.type === "memo") return 1;
                const aTime = a.last_message?.created_at ?? a.updated_at;
                const bTime = b.last_message?.created_at ?? b.updated_at;
                return new Date(bTime).getTime() - new Date(aTime).getTime();
              })
          );

          // Toast for other channels
          if (fullMsg.user_id !== userId) {
            if (!mutedChannelsRef.current.has(fullMsg.channel_id)) {
              const senderName = fullMsg.user_profile?.full_name ?? "누군가";
              toast.info(`${senderName}: ${fullMsg.content}`, { duration: 3000 });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [userId, userName]);

  const handleSelectChannel = useCallback(
    async (channel: ChannelWithDetails) => {
      setSelectedChannel(channel);
      setMobileShowChat(true);
      setShowSettings(false);

      const supabase = createClient();
      const msgs = await fetchMessages(supabase, channel.id);
      setMessages(msgs);

      await markAsRead(channel.id);
      setChannels((prev) =>
        prev.map((ch) => (ch.id === channel.id ? { ...ch, unread_count: 0 } : ch))
      );
    },
    []
  );

  const handleCreateChannel = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  const handleChannelCreated = useCallback(
    async (channel: Channel) => {
      // Fetch full channel with members so settings drawer is populated immediately
      const supabase = createClient();
      const full = await getChannelById(supabase, channel.id);
      const withDetails: ChannelWithDetails = full ?? {
        ...channel,
        members: [],
        member_count: 1,
        last_message: null,
        unread_count: 0,
      };
      setChannels((prev) => [withDetails, ...prev]);
      handleSelectChannel(withDetails);
    },
    [handleSelectChannel]
  );

  const handleBackToList = useCallback(() => {
    setMobileShowChat(false);
  }, []);

  const handleChannelUpdated = useCallback((updated: ChannelWithDetails) => {
    setSelectedChannel(updated);
    setChannels((prev) => prev.map((ch) => (ch.id === updated.id ? updated : ch)));
  }, []);

  const handleChannelDeleted = useCallback(() => {
    setChannels((prev) => prev.filter((ch) => ch.id !== selectedChannel?.id));
    setSelectedChannel(undefined);
    setShowSettings(false);
    setMobileShowChat(false);
  }, [selectedChannel?.id]);

  const handleMuteToggled = useCallback((channelId: string, muted: boolean) => {
    setMutedChannels((prev) => {
      const next = new Set(prev);
      if (muted) next.add(channelId);
      else next.delete(channelId);
      return next;
    });
  }, []);

  const handleFavoriteToggled = useCallback((channelId: string, favorite: boolean) => {
    setFavoriteChannels((prev) => {
      const next = new Set(prev);
      if (favorite) next.add(channelId);
      else next.delete(channelId);
      return next;
    });
  }, []);

  const hasChannels = channels.length > 0;

  return (
    <>
      <div className="flex h-[calc(100vh-8rem)] rounded-2xl overflow-hidden bg-white shadow-sm">
        {/* Channel list */}
        <div
          className={`${
            mobileShowChat ? "hidden md:flex" : "flex"
          } w-full md:w-auto`}
        >
          {hasChannels ? (
            <ChannelList
              channels={channels}
              selectedChannelId={selectedChannel?.id}
              mutedChannels={mutedChannels}
              favoriteChannels={favoriteChannels}
              onSelectChannel={handleSelectChannel}
              onCreateClick={handleCreateChannel}
            />
          ) : (
            <div className="w-80 flex-shrink-0 border-r border-slate-100 flex flex-col bg-white items-center justify-center">
              <EmptyState type="no-channels" onCreateChannel={handleCreateChannel} />
            </div>
          )}
        </div>

        {/* Chat room panel */}
        <div
          className={`${
            mobileShowChat ? "flex" : "hidden md:flex"
          } flex-1 flex-col min-w-0`}
        >
          {selectedChannel ? (
            <ChatRoom
              channel={selectedChannel}
              messages={messages}
              userId={userId}
              userName={userName}
              onMessagesUpdate={setMessages}
              onBack={handleBackToList}
              onSettingsClick={() => setShowSettings(true)}
              onlineCount={onlineUsers.size > 0 ? onlineUsers.size : undefined}
            />
          ) : (
            <EmptyState type="no-selection" />
          )}
        </div>
      </div>

      {/* Channel Create Modal */}
      {showCreateModal && (
        <ChannelCreateModal
          onClose={() => setShowCreateModal(false)}
          userId={userId}
          onCreated={handleChannelCreated}
        />
      )}

      {/* Channel Settings Drawer */}
      {selectedChannel && (
        <ChannelSettingsDrawer
          open={showSettings}
          channel={selectedChannel}
          userId={userId}
          userName={userName}
          onClose={() => setShowSettings(false)}
          onChannelUpdated={handleChannelUpdated}
          onChannelDeleted={handleChannelDeleted}
          onLeft={handleChannelDeleted}
          onMuteToggled={handleMuteToggled}
          onFavoriteToggled={handleFavoriteToggled}
          onlineUsers={onlineUsers}
        />
      )}
    </>
  );
}
