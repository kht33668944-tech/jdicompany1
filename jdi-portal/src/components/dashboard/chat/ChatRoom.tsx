"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { ChannelWithDetails, Message } from "@/lib/chat/types";
import { sendMessage, editMessage, deleteMessage, markAsRead, uploadChatFile, pinMessage, unpinMessage, getPinnedMessages } from "@/lib/chat/actions";
import { isImageFile } from "@/lib/chat/utils";
import { getMessages } from "@/lib/chat/queries";
import { Paperclip } from "phosphor-react";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import MessageSearch from "./MessageSearch";
import ChatDrawer from "./ChatDrawer";
import PinnedMessagesPanel from "./PinnedMessagesPanel";

interface ChatRoomProps {
  channel: ChannelWithDetails;
  messages: Message[];
  userId: string;
  userName: string;
  userAvatar?: string | null;
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  onBack?: () => void;
  onSettingsClick: () => void;
  onlineCount?: number;
}

export default function ChatRoom({
  channel,
  messages,
  userId,
  userName,
  userAvatar,
  onMessagesUpdate,
  onBack,
  onSettingsClick,
  onlineCount,
}: ChatRoomProps) {
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showPinnedPanel, setShowPinnedPanel] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [dragging, setDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const dragCountRef = useRef(0);
  const isFocused = useRef(true);
  const onMessagesUpdateRef = useRef(onMessagesUpdate);
  // ref 동기화는 effect 로 — render 중 ref mutation 금지 (React 19)
  useEffect(() => {
    onMessagesUpdateRef.current = onMessagesUpdate;
  }, [onMessagesUpdate]);
  const presenceChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 채널 변경 시 검색/서랍/고정 패널 닫기 + 고정 메시지 로드
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setShowSearch(false);
    setShowDrawer(false);
    setShowPinnedPanel(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    getPinnedMessages(channel.id).then(setPinnedMessages).catch(() => {});
  }, [channel.id]);

  // Presence channel for typing indicators
  useEffect(() => {
    const supabase = createClient();
    const presenceChannel = supabase.channel(`typing:${channel.id}`, {
      config: { presence: { key: userId } },
    });
    presenceChannelRef.current = presenceChannel;

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const typing = Object.entries(state)
          .filter(([key]) => key !== userId)
          .filter(([, presences]) => (presences as unknown as { typing: boolean; name: string }[])?.[0]?.typing)
          .map(([, presences]) => (presences as unknown as { typing: boolean; name: string }[])?.[0]?.name ?? "");
        setTypingUsers(typing);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ typing: false, name: userName });
        }
      });

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      presenceChannelRef.current = null;
      supabase.removeChannel(presenceChannel);
    };
  }, [channel.id, userId, userName]);

  // Mark as read on mount
  useEffect(() => {
    markAsRead(channel.id).catch(() => {});
  }, [channel.id]);

  // Focus tracking
  useEffect(() => {
    function onFocus() {
      isFocused.current = true;
      markAsRead(channel.id).catch(() => {});
    }
    function onBlur() {
      isFocused.current = false;
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [channel.id]);

  // Realtime subscription for INSERT and UPDATE on messages
  useEffect(() => {
    const supabase = createClient();
    const sub = supabase
      .channel(`chat:${channel.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channel.id}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;

          // 본인이 보낸 메시지는 handleSend에서 이미 추가됨 → 중복 방지
          if (newMsg.user_id === userId) return;

          // 기존 메시지 목록에서 동일 사용자의 프로필을 캐시에서 검색
          let cachedProfile: { full_name: string; avatar_url: string | null } | undefined;
          onMessagesUpdateRef.current((prev) => {
            const found = prev.find((m) => m.user_id === newMsg.user_id && m.user_profile);
            if (found?.user_profile) cachedProfile = found.user_profile;
            return prev; // 변경 없음 (탐색만)
          });

          if (cachedProfile) {
            // 캐시 히트: 즉시 추가
            const enriched = { ...newMsg, user_profile: cachedProfile };
            onMessagesUpdateRef.current((prev) => {
              if (prev.some((m) => m.id === enriched.id)) return prev;
              return [...prev, enriched];
            });
            return;
          }

          // 캐시 미스: 일단 추가하고, 프로필 도착하면 채움
          onMessagesUpdateRef.current((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", newMsg.user_id)
            .single();
          if (profile) {
            onMessagesUpdateRef.current((prev) =>
              prev.map((m) => (m.id === newMsg.id ? { ...m, user_profile: profile } : m))
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channel.id}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          onMessagesUpdateRef.current((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? { ...m, ...updated, user_profile: m.user_profile }
                : m
            )
          );
          // 고정 메시지 패널 실시간 동기화 (#3)
          setPinnedMessages((prev) => {
            const wasPinned = prev.some((p) => p.id === updated.id);
            if (updated.is_pinned && !updated.is_deleted) {
              if (wasPinned) {
                return prev.map((p) => (p.id === updated.id ? { ...p, ...updated, user_profile: p.user_profile } : p));
              }
              // 새로 고정됨 — 호출자가 user_profile 모를 수 있으므로 messages 캐시에서 시도
              let userProfile: Message["user_profile"];
              onMessagesUpdateRef.current((cur) => {
                const found = cur.find((m) => m.id === updated.id);
                userProfile = found?.user_profile;
                return cur;
              });
              return [{ ...updated, user_profile: userProfile }, ...prev];
            } else {
              // 고정 해제 또는 삭제
              return wasPinned ? prev.filter((p) => p.id !== updated.id) : prev;
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [channel.id]);

  function broadcastTyping() {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    presenceChannelRef.current?.track({ typing: true, name: userName });
    typingTimeoutRef.current = setTimeout(() => {
      presenceChannelRef.current?.track({ typing: false, name: userName });
    }, 3000);
  }

  async function handleSend(content: string) {
    try {
      if (editingMessage) {
        await editMessage(editingMessage.id, content);
        setEditingMessage(null);
      } else {
        const sent = await sendMessage({ channelId: channel.id, content, parentMessageId: replyingTo?.id });
        setReplyingTo(null);
        // sendMessage가 더 이상 프로필을 채우지 않으므로 보낸이 정보로 직접 채움
        const sentWithProfile: Message = {
          ...sent,
          user_profile: { full_name: userName, avatar_url: userAvatar ?? null },
        };
        onMessagesUpdate((prev) => {
          if (prev.some((m) => m.id === sentWithProfile.id)) return prev;
          return [...prev, sentWithProfile];
        });
      }
    } catch (err) {
      console.error("메시지 전송 실패:", err);
      toast.error("메시지 전송에 실패했습니다.");
    }
  }

  async function handleLoadMore() {
    if (messages.length === 0) return;
    const cursor = messages[0].created_at;
    try {
      const supabase = createClient();
      const older = await getMessages(supabase, channel.id, cursor);
      if (older.length > 0) {
        onMessagesUpdate((prev) => [...older, ...prev]);
      }
    } catch (err) {
      console.error("이전 메시지 로드 실패:", err);
      toast.error("이전 메시지를 불러오지 못했습니다.");
    }
  }

  async function handleFileUpload(file: File) {
    try {
      const result = await uploadChatFile(channel.id, file);
      const msgType = isImageFile(file.type) ? "image" : "file";
      const content = JSON.stringify({
        path: result.path,
        name: result.fileName,
        size: result.fileSize,
        type: result.fileType,
      });
      const sent = await sendMessage({ channelId: channel.id, content, type: msgType });
      const sentWithProfile: Message = {
        ...sent,
        user_profile: { full_name: userName, avatar_url: userAvatar ?? null },
      };
      onMessagesUpdate((prev) => {
        if (prev.some((m) => m.id === sentWithProfile.id)) return prev;
        return [...prev, sentWithProfile];
      });
    } catch (err) {
      console.error("파일 업로드 실패:", err);
      toast.error("파일 업로드에 실패했습니다.");
    }
  }

  async function handleDeleteMessage(message: Message) {
    try {
      await deleteMessage(message.id);
    } catch (err) {
      console.error("메시지 삭제 실패:", err);
      toast.error("메시지 삭제에 실패했습니다.");
    }
  }

  async function handlePinMessage(message: Message) {
    try {
      if (message.is_pinned) {
        await unpinMessage(message.id);
        setPinnedMessages((prev) => prev.filter((m) => m.id !== message.id));
        onMessagesUpdate((prev) =>
          prev.map((m) => m.id === message.id ? { ...m, is_pinned: false, pinned_by: null, pinned_at: null } : m)
        );
      } else {
        await pinMessage(message.id);
        const updated = await getPinnedMessages(channel.id);
        setPinnedMessages(updated);
        onMessagesUpdate((prev) =>
          prev.map((m) => m.id === message.id ? { ...m, is_pinned: true } : m)
        );
      }
    } catch (err) {
      console.error("메시지 고정 실패:", err);
      toast.error("메시지 고정에 실패했습니다.");
    }
  }

  async function handleUnpinMessage(message: Message) {
    try {
      await unpinMessage(message.id);
      setPinnedMessages((prev) => prev.filter((m) => m.id !== message.id));
      onMessagesUpdate((prev) =>
        prev.map((m) => m.id === message.id ? { ...m, is_pinned: false, pinned_by: null, pinned_at: null } : m)
      );
    } catch (err) {
      console.error("메시지 고정 해제 실패:", err);
      toast.error("메시지 고정 해제에 실패했습니다.");
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCountRef.current++;
    if (e.dataTransfer.types.includes("Files")) setDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current === 0) setDragging(false);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCountRef.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) setDroppedFiles(files);
  }

  return (
    <div
      className="flex-1 flex flex-col h-full relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragging && (
        <div className="absolute inset-0 z-30 bg-blue-50/80 border-2 border-dashed border-blue-400 rounded-2xl flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Paperclip size={32} className="text-blue-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-blue-600">파일을 여기에 놓으세요</p>
          </div>
        </div>
      )}
      <ChatHeader
        channel={channel}
        onBack={onBack}
        onSettingsClick={onSettingsClick}
        onSearchClick={() => setShowSearch((v) => !v)}
        onDrawerClick={() => setShowDrawer(true)}
        onPinnedClick={() => setShowPinnedPanel((v) => !v)}
        pinnedCount={pinnedMessages.length}
        onlineCount={onlineCount}
      />
      <PinnedMessagesPanel
        open={showPinnedPanel}
        messages={pinnedMessages}
        onClose={() => setShowPinnedPanel(false)}
        onUnpin={handleUnpinMessage}
      />
      {showSearch && (
        <MessageSearch
          channelId={channel.id}
          onClose={() => setShowSearch(false)}
        />
      )}
      <MessageList
        messages={messages}
        userId={userId}
        channel={channel}
        onLoadMore={handleLoadMore}
        onEditMessage={(msg) => setEditingMessage(msg)}
        onDeleteMessage={handleDeleteMessage}
        onReplyMessage={setReplyingTo}
        onPinMessage={handlePinMessage}
        typingUsers={typingUsers}
      />
      <MessageInput
        onSend={handleSend}
        onFileUpload={handleFileUpload}
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        externalFiles={droppedFiles}
        onExternalFilesConsumed={() => setDroppedFiles([])}
        onTyping={broadcastTyping}
      />
      <ChatDrawer
        open={showDrawer}
        channelId={channel.id}
        channelName={channel.name}
        onClose={() => setShowDrawer(false)}
      />
    </div>
  );
}
