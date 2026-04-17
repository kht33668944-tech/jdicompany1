"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getMessages as fetchMessages, getChannelById } from "@/lib/chat/queries";
import { ensureMemoChannel, markAsRead, getAllProfiles } from "@/lib/chat/actions";
import { openOrCreateDm } from "@/lib/chat/dm";
import { parseFileContent } from "@/lib/chat/utils";
import {
  getCachedMessages,
  cacheMessages,
  upsertCachedMessage,
} from "@/lib/chat/messageCache";
import { showDesktopNotification } from "@/lib/notifications/desktop";
import type { ChannelWithDetails, Message, Channel, ApprovedProfile } from "@/lib/chat/types";
import ChannelList from "./ChannelList";
import ChatRoom from "./ChatRoom";
import EmptyState from "./EmptyState";
import ChannelCreateModal from "./ChannelCreateModal";
import ChannelSettingsDrawer from "./ChannelSettingsDrawer";
import { ChatFileUrlsProvider, useChatFileUrls } from "./ChatFileUrlsContext";
import PushPromptBanner from "./PushPromptBanner";
import { touchChannelSeen } from "@/lib/push/actions";
import { usePresence } from "./hooks/usePresence";
import { useMembershipSync } from "./hooks/useMembershipSync";
import { useChannelMetaSync } from "./hooks/useChannelMetaSync";

interface ChatPageClientProps {
  initialChannels: ChannelWithDetails[];
  initialChannel?: ChannelWithDetails;
  initialMessages?: Message[];
  initialPeople?: ApprovedProfile[];
  userId: string;
  userName: string;
  userAvatar?: string | null;
}

export default function ChatPageClient(props: ChatPageClientProps) {
  return (
    <ChatFileUrlsProvider>
      <ChatPageClientInner {...props} />
    </ChatFileUrlsProvider>
  );
}

function ChatPageClientInner({
  initialChannels,
  initialChannel,
  initialMessages,
  initialPeople,
  userId,
  userName,
  userAvatar,
}: ChatPageClientProps) {
  const { ensure: ensureFileUrls } = useChatFileUrls();
  const [channels, setChannels] = useState<ChannelWithDetails[]>(initialChannels);
  const [selectedChannel, setSelectedChannel] = useState<ChannelWithDetails | undefined>(
    initialChannel
  );
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(!!initialChannel);
  const [mutedChannels, setMutedChannels] = useState<Set<string>>(new Set());
  const [favoriteChannels, setFavoriteChannels] = useState<Set<string>>(new Set());
  const [people, setPeople] = useState<ApprovedProfile[]>(initialPeople ?? []);
  const [pendingDmForPartner, setPendingDmForPartner] = useState<string | null>(null);
  const onlineUsers = usePresence(userId);
  // 현재 선택된 채널의 멤버 ID 셋 — 채널별 온라인 인원 계산용
  const [selectedChannelMemberIds, setSelectedChannelMemberIds] = useState<Set<string>>(new Set());

  const selectedChannelRef = useRef(selectedChannel);
  const mutedChannelsRef = useRef(mutedChannels);
  const channelsRef = useRef(channels);
  // 채널별 메시지 캐시 — 채널 전환 시 즉시 표시용 (SSR 초기 메시지로 시드)
  const messagesCacheRef = useRef<Map<string, Message[]>>(
    new Map(initialChannel && initialMessages ? [[initialChannel.id, initialMessages]] : [])
  );

  // ref 동기화는 effect 로 (React 19: render 중 ref mutation 금지)
  useEffect(() => { selectedChannelRef.current = selectedChannel; }, [selectedChannel]);
  useEffect(() => { mutedChannelsRef.current = mutedChannels; }, [mutedChannels]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  // 파일/이미지 메시지의 서명 URL을 batch 로 미리 요청
  // - 메시지 목록 변경 시 누락된 path 만 추출해 단일 createSignedUrls 호출
  // - 하위 GridImage/ChatImage/ChatFile 는 context 에서 즉시 조회 (네트워크 0회)
  useEffect(() => {
    if (messages.length === 0) return;
    const paths: string[] = [];
    for (const m of messages) {
      if (m.is_deleted) continue;
      if (m.type !== "image" && m.type !== "file") continue;
      const file = parseFileContent(m.content);
      if (file?.path) paths.push(file.path);
    }
    if (paths.length > 0) ensureFileUrls(paths);
  }, [messages, ensureFileUrls]);

  // setMessages 래퍼: state 갱신과 함께 현재 채널 캐시도 동기화
  // (실시간 INSERT, 메시지 편집/삭제, 더 보기 등 모든 경로가 캐시를 자동 갱신)
  const updateMessages = useCallback(
    (updater: (prev: Message[]) => Message[]) => {
      setMessages((prev) => {
        const next = updater(prev);
        const channelId = selectedChannelRef.current?.id;
        if (channelId) {
          messagesCacheRef.current.set(channelId, next);
          // IndexedDB 동기화 — 새로 추가/변경된 메시지만 upsert
          // (전체 저장은 handleSelectChannel 의 cacheMessages 가 담당)
          const prevIds = new Set(prev.map((m) => m.id));
          const changed: Message[] = [];
          for (const m of next) {
            const old = prev.find((p) => p.id === m.id);
            if (!prevIds.has(m.id) || old !== m) changed.push(m);
          }
          if (changed.length > 0) {
            void cacheMessages(channelId, changed);
          }
        }
        return next;
      });
    },
    []
  );

  // 선택된 채널이 바뀔 때마다 멤버 목록 fetch (초기 진입/외부 라우팅 포함)
  useEffect(() => {
    if (!selectedChannel) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", selectedChannel.id)
      .then(({ data }) => {
        if (cancelled) return;
        setSelectedChannelMemberIds(new Set((data ?? []).map((m) => m.user_id as string)));
      });
    return () => { cancelled = true; };
  }, [selectedChannel?.id]);

  // 선택 해제 시 멤버 목록 비우기 (event 처리에서 직접 호출하는 게 맞지만 안전망)
  useEffect(() => {
    if (selectedChannel) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedChannelMemberIds(new Set());
  }, [selectedChannel]);

  // DM별 안읽은 수를 상대방 id → count 로 매핑 (직원 목록 뱃지에 사용)
  const dmUnreadByPartner = useMemo(() => {
    const map = new Map<string, number>();
    for (const ch of channels) {
      if (ch.type !== "dm") continue;
      if (!ch.dm_partner_id) continue;
      if (ch.unread_count > 0) map.set(ch.dm_partner_id, ch.unread_count);
    }
    return map;
  }, [channels]);

  const selectedDmPartnerId = selectedChannel?.type === "dm"
    ? selectedChannel.dm_partner_id ?? null
    : null;

  // 현재 채널 멤버 중 온라인인 사람 수 (전체 온라인 X)
  const channelOnlineCount = useMemo(() => {
    if (selectedChannelMemberIds.size === 0) return 0;
    let count = 0;
    for (const id of selectedChannelMemberIds) {
      if (onlineUsers.has(id)) count++;
    }
    return count;
  }, [selectedChannelMemberIds, onlineUsers]);

  // 직원 목록 로드 (본인 제외, 승인된 사용자만)
  useEffect(() => {
    getAllProfiles()
      .then((list) => {
        setPeople(list.filter((p) => p.id !== userId));
      })
      .catch(() => { /* silent — 직원 섹션만 비어 보임 */ });
  }, [userId]);

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

  // 채널 멤버십 실시간 동기화 (다른 사람이 나를 채널에 초대/제거하면 즉시 반영)
  useMembershipSync(userId, setChannels, selectedChannelRef, setSelectedChannel, setMobileShowChat, setMutedChannels, setFavoriteChannels);

  // 채널 메타(이름/설명/updated_at) + 멤버 수 실시간 동기화
  useChannelMetaSync(setChannels, setSelectedChannel, channelsRef);

  // Global realtime subscription for new messages
  useEffect(() => {
    const supabase = createClient();
    const realtimeChannel = supabase
      .channel("chat:global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          // payload.new를 그대로 사용 — 메시지 refetch 제거
          const fullMsg = payload.new as Message;

          // 발신자 프로필 lazy fetch (목록 미리보기에 필요)
          if (fullMsg.user_id !== userId) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, avatar_url")
              .eq("id", fullMsg.user_id)
              .single();
            if (profile) fullMsg.user_profile = profile;
          }

          const currentSelected = selectedChannelRef.current;

          // 다른 채널 메시지도 IndexedDB 에 캐시 — 그 채널 진입 시 즉시 표시
          // (현재 채널은 ChatRoom → updateMessages 가 이미 캐시함)
          if (currentSelected?.id !== fullMsg.channel_id) {
            void upsertCachedMessage(fullMsg);
          }

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

              // OS 네이티브 알림도 동시 표시 (메시지마다 고유 tag)
              showDesktopNotification({
                title: senderName,
                body: fullMsg.type === "image" ? "사진을 보냈습니다." : fullMsg.type === "file" ? "파일을 보냈습니다." : fullMsg.content,
                link: `/dashboard/chat/${fullMsg.channel_id}`,
                tag: `chat-msg:${fullMsg.id}`,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [userId, userName]);

  // 활성 채널 heartbeat: last_seen_at 갱신으로 푸시 알림 억제
  useEffect(() => {
    if (!selectedChannel?.id) return;
    void touchChannelSeen(selectedChannel.id);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        void touchChannelSeen(selectedChannel.id);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [selectedChannel?.id]);

  const handleSelectChannel = useCallback(
    async (channel: ChannelWithDetails) => {
      // 같은 채널 재선택 시 아무 것도 안 함 (불필요한 fetch 방지)
      if (selectedChannelRef.current?.id === channel.id) {
        setMobileShowChat(true);
        setShowSettings(false);
        return;
      }

      // 1) 즉시 UI 전환 — ref도 즉시 갱신해 늦게 도착하는 fetch 결과의 채널 매칭 가능
      selectedChannelRef.current = channel;
      setSelectedChannel(channel);
      setMobileShowChat(true);
      setShowSettings(false);

      // 2) 캐시된 메시지가 있으면 즉시 표시 (체감상 0ms 전환)
      //    - 메모리 캐시(같은 세션) 우선
      //    - 없으면 IndexedDB(이전 세션) 조회 → 즉시 표시
      //    - 둘 다 없으면 로딩 스피너
      const memCached = messagesCacheRef.current.get(channel.id);
      if (memCached) {
        setMessages(memCached);
        setLoadingMessages(false);
      } else {
        setMessages([]);
        setLoadingMessages(true);
        // IndexedDB 비동기 조회 — fetch 보다 먼저 끝나면 즉시 표시
        void getCachedMessages(channel.id).then((cached) => {
          if (cached.length === 0) return;
          if (selectedChannelRef.current?.id !== channel.id) return;
          // fetch 결과가 이미 도착했으면 메모리 캐시가 채워져 있어 덮어쓰지 않음
          if (messagesCacheRef.current.has(channel.id)) return;
          messagesCacheRef.current.set(channel.id, cached);
          setMessages(cached);
          setLoadingMessages(false);
        });
      }

      // 3) 안 읽음 뱃지는 낙관적 즉시 0 으로 (RPC 응답 기다리지 않음)
      setChannels((prev) =>
        prev.map((ch) => (ch.id === channel.id ? { ...ch, unread_count: 0 } : ch))
      );

      // 4) 읽음 처리는 fire-and-forget — UI 차단하지 않음
      markAsRead(channel.id).catch(() => {});

      // 5) 백그라운드로 최신 메시지 fetch — 끝나면 캐시 갱신 후 화면 반영
      //    (channel_members 는 selectedChannel?.id useEffect 가 처리하므로 중복 fetch 제거)
      try {
        const supabase = createClient();
        const msgs = await fetchMessages(supabase, channel.id);
        messagesCacheRef.current.set(channel.id, msgs);
        // IndexedDB 동기화 (백그라운드, 사용자 흐름 차단 X)
        void cacheMessages(channel.id, msgs);
        // 그 사이 다른 채널로 이동했다면 무시
        if (selectedChannelRef.current?.id === channel.id) {
          setMessages(msgs);
        }
      } catch (err) {
        console.error("메시지 로드 실패:", err);
      } finally {
        if (selectedChannelRef.current?.id === channel.id) {
          setLoadingMessages(false);
        }
      }
    },
    []
  );

  const handleSelectPerson = useCallback(
    async (person: ApprovedProfile) => {
      // 이미 채널 있으면 즉시 선택 (RPC 왕복 없이)
      const existing = channelsRef.current.find(
        (ch) => ch.type === "dm" && ch.dm_partner_id === person.id
      );
      if (existing) {
        handleSelectChannel(existing);
        return;
      }

      if (pendingDmForPartner === person.id) return;
      setPendingDmForPartner(person.id);

      try {
        const channelId = await openOrCreateDm(person.id);
        const supabase = createClient();
        const { data: ch } = await supabase
          .from("channels")
          .select("*")
          .eq("id", channelId)
          .single();

        if (!ch) throw new Error("채널을 찾을 수 없습니다.");

        const withDetails: ChannelWithDetails = {
          ...(ch as Channel),
          members: [],
          member_count: 2,
          last_message: null,
          unread_count: 0,
          dm_partner_id: person.id,
          members_preview: [
            { id: person.id, full_name: person.full_name, avatar_url: person.avatar_url },
          ],
        };

        setChannels((prev) => {
          if (prev.some((c) => c.id === withDetails.id)) return prev;
          return [withDetails, ...prev];
        });
        handleSelectChannel(withDetails);
      } catch (err) {
        console.error("DM 열기 실패:", err);
        toast.error("대화방을 열지 못했습니다.");
      } finally {
        setPendingDmForPartner(null);
      }
    },
    [handleSelectChannel, pendingDmForPartner]
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

  const hasSidebarContent = channels.length > 0 || people.length > 0;

  return (
    <>
      <PushPromptBanner userId={userId} />
      <div className="flex h-[calc(100dvh-7rem)] sm:h-[calc(100vh-8rem)] rounded-2xl overflow-hidden bg-white shadow-sm">
        {/* Channel list */}
        <div
          className={`${
            mobileShowChat ? "hidden md:flex" : "flex"
          } w-full md:w-auto`}
        >
          {hasSidebarContent ? (
            <ChannelList
              channels={channels}
              people={people}
              onlineUserIds={onlineUsers}
              dmUnreadByPartner={dmUnreadByPartner}
              selectedChannelId={selectedChannel?.id}
              selectedPartnerId={selectedDmPartnerId ?? undefined}
              mutedChannels={mutedChannels}
              favoriteChannels={favoriteChannels}
              onSelectChannel={handleSelectChannel}
              onSelectPerson={handleSelectPerson}
              onCreateClick={handleCreateChannel}
            />
          ) : (
            <div className="w-full sm:w-80 flex-shrink-0 border-r border-slate-100 flex flex-col bg-white items-center justify-center">
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
              loading={loadingMessages}
              userId={userId}
              userName={userName}
              userAvatar={userAvatar}
              onMessagesUpdate={updateMessages}
              onBack={handleBackToList}
              onSettingsClick={() => setShowSettings(true)}
              onlineCount={channelOnlineCount > 0 ? channelOnlineCount : undefined}
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
