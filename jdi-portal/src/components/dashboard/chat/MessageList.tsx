"use client";

import { useRef, useEffect, useState } from "react";
import Image from "next/image";
import type { Message, ChannelWithDetails } from "@/lib/chat/types";
import { groupMessagesByDate, formatDateDivider, formatMessageTime, parseFileContent } from "@/lib/chat/utils";
import { getChatFileUrl } from "@/lib/chat/actions";
import { useChatFileUrls } from "./ChatFileUrlsContext";
import MessageItem from "./MessageItem";
import EmptyState from "./EmptyState";

// --- Image group types and helpers ---

type MessageChunk =
  | { type: "single"; message: Message }
  | { type: "image-group"; messages: Message[]; userId: string };

function groupConsecutiveImages(messages: Message[]): MessageChunk[] {
  const chunks: MessageChunk[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    if (msg.type === "image" && !msg.is_deleted) {
      const userId = msg.user_id;
      const group: Message[] = [msg];
      let j = i + 1;
      while (j < messages.length && messages[j].type === "image" && !messages[j].is_deleted && messages[j].user_id === userId) {
        group.push(messages[j]);
        j++;
      }
      if (group.length >= 2) {
        chunks.push({ type: "image-group", messages: group, userId });
        i = j;
      } else {
        chunks.push({ type: "single", message: msg });
        i++;
      }
    } else {
      chunks.push({ type: "single", message: msg });
      i++;
    }
  }
  return chunks;
}

// --- GridImage: loads signed URL for a single image in the group grid ---

function GridImage({ storagePath, fileName }: { storagePath: string; fileName: string }) {
  const { urls: batchUrls } = useChatFileUrls();
  const batched = batchUrls[storagePath];
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  // batch 에서 받지 못한 경우에만 개별 요청 (실시간 신규 파일 등 edge case)
  useEffect(() => {
    if (batched) return;
    let cancelled = false;
    getChatFileUrl(storagePath)
      .then((u) => { if (!cancelled) setFallbackUrl(u); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [storagePath, batched]);

  const url = batched ?? fallbackUrl;

  if (error) {
    return (
      <div className="w-full h-28 bg-red-50 rounded-xl flex items-center justify-center text-[10px] text-red-400">
        오류
      </div>
    );
  }
  if (!url) {
    return (
      <div className="w-full h-28 bg-slate-100 rounded-xl animate-pulse flex items-center justify-center">
        <span className="text-[10px] text-slate-400">로딩 중...</span>
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={url}
        alt={fileName}
        className="w-full h-28 rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
      />
    </a>
  );
}

// --- ImageGroupRenderer: renders a grid of consecutive images ---

function ImageGroupRenderer({ chunk, isOwn }: { chunk: Extract<MessageChunk, { type: "image-group" }>; isOwn: boolean }) {
  const firstMsg = chunk.messages[0];
  const profile = firstMsg.user_profile;
  const lastMsg = chunk.messages[chunk.messages.length - 1];
  const cols = chunk.messages.length === 2 ? "grid-cols-2" : "grid-cols-3";

  if (isOwn) {
    return (
      <div className="flex flex-row-reverse items-start gap-3">
        <div className="space-y-1 text-right max-w-[70%]">
          <div className="flex flex-row-reverse items-end gap-2">
            <span className="text-[10px] text-slate-400">
              {formatMessageTime(lastMsg.created_at)}
            </span>
          </div>
          <div className={`grid ${cols} gap-1`}>
            {chunk.messages.map((msg) => {
              const file = parseFileContent(msg.content);
              if (!file) return null;
              return <GridImage key={msg.id} storagePath={file.path} fileName={file.name} />;
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 sm:gap-3">
      {profile?.avatar_url ? (
        <Image
          src={profile.avatar_url}
          alt={profile.full_name ?? ""}
          width={36}
          height={36}
          className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex-shrink-0 object-cover"
        />
      ) : (
        <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-indigo-100 flex-shrink-0 flex items-center justify-center text-indigo-600 font-bold text-xs sm:text-sm">
          {profile?.full_name?.charAt(0) ?? "?"}
        </div>
      )}
      <div className="space-y-0.5 sm:space-y-1 max-w-[75%] sm:max-w-[70%]">
        <div className="flex items-end gap-1.5 sm:gap-2">
          <span className="text-[11px] sm:text-xs font-bold text-slate-800">{profile?.full_name}</span>
          <span className="text-[10px] text-slate-400">{formatMessageTime(lastMsg.created_at)}</span>
        </div>
        <div className={`grid ${cols} gap-1`}>
          {chunk.messages.map((msg) => {
            const file = parseFileContent(msg.content);
            if (!file) return null;
            return <GridImage key={msg.id} storagePath={file.path} fileName={file.name} />;
          })}
        </div>
      </div>
    </div>
  );
}

interface MessageListProps {
  messages: Message[];
  loading?: boolean;
  userId: string;
  channel: ChannelWithDetails;
  onLoadMore: () => Promise<void>;
  onEditMessage?: (message: Message) => void;
  onDeleteMessage?: (message: Message) => void;
  onReplyMessage?: (message: Message) => void;
  onPinMessage?: (message: Message) => void;
  typingUsers?: string[];
}

function MessageSkeleton() {
  // 정적 패턴 — 매 렌더마다 위치/크기가 흔들리지 않도록 고정
  const rows = [
    { own: false, w: "w-44" },
    { own: false, w: "w-64" },
    { own: true, w: "w-40" },
    { own: false, w: "w-52" },
    { own: true, w: "w-56" },
    { own: false, w: "w-36" },
  ];
  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {rows.map((r, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 ${r.own ? "flex-row-reverse" : ""}`}
        >
          {!r.own && <div className="w-9 h-9 rounded-xl bg-slate-100 animate-pulse flex-shrink-0" />}
          <div className={`space-y-2 ${r.own ? "items-end" : ""}`}>
            {!r.own && <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />}
            <div className={`h-10 ${r.w} bg-slate-100 rounded-2xl animate-pulse`} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MessageList({
  messages,
  loading = false,
  userId,
  channel,
  onLoadMore,
  onEditMessage,
  onDeleteMessage,
  onReplyMessage,
  onPinMessage,
  typingUsers,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);
  const prevChannelId = useRef(channel.id);
  const [loadingMore, setLoadingMore] = useState(false);

  // 채널 전환 시 스크롤 상태 리셋 + 하단으로 이동
  useEffect(() => {
    if (prevChannelId.current !== channel.id) {
      isNearBottom.current = true;
      prevChannelId.current = channel.id;
    }
    if (containerRef.current) {
      // 렌더 완료 후 스크롤 (이미지 등 비동기 콘텐츠 대비)
      requestAnimationFrame(() => {
        if (isNearBottom.current && containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      });
    }
  }, [channel.id, messages]);

  // 최초 마운트 시 하단으로
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  async function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;

    if (el.scrollTop === 0 && !loadingMore) {
      const prevScrollHeight = el.scrollHeight;
      setLoadingMore(true);
      try {
        await onLoadMore();
        // Preserve scroll position after prepending older messages
        requestAnimationFrame(() => {
          if (el) {
            el.scrollTop = el.scrollHeight - prevScrollHeight;
          }
        });
      } finally {
        setLoadingMore(false);
      }
    }
  }

  if (messages.length === 0) {
    if (loading) return <MessageSkeleton />;
    return (
      <div className="flex-1 overflow-y-auto flex items-center justify-center">
        <EmptyState type="no-messages" />
      </div>
    );
  }

  const groups = groupMessagesByDate(messages);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {loadingMore && (
        <div className="flex justify-center py-2">
          <span className="text-[11px] text-slate-400">이전 메시지 불러오는 중...</span>
        </div>
      )}
      {groups.map((group) => (
        <div key={group.date} className="space-y-3 sm:space-y-4">
          {/* Date divider */}
          <div className="flex items-center justify-center py-2 sm:py-4">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="px-3 sm:px-4 text-[10px] sm:text-[11px] font-bold text-slate-400 tracking-wider">
              {formatDateDivider(group.date)}
            </span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>

          {groupConsecutiveImages(group.messages).map((chunk) =>
            chunk.type === "image-group" ? (
              <ImageGroupRenderer
                key={`img-group-${chunk.messages[0].id}`}
                chunk={chunk}
                isOwn={chunk.userId === userId}
              />
            ) : (
              <MessageItem
                key={chunk.message.id}
                message={chunk.message}
                isOwn={chunk.message.user_id === userId}
                userId={userId}
                onEdit={onEditMessage}
                onDelete={onDeleteMessage}
                onReply={onReplyMessage}
                onPin={onPinMessage}
              />
            )
          )}
        </div>
      ))}
      {typingUsers && typingUsers.length > 0 && (
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
          <span className="text-xs text-slate-400">{typingUsers.join(", ")}님이 입력 중...</span>
        </div>
      )}
    </div>
  );
}
