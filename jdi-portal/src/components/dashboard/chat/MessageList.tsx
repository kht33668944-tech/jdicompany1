"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import Image from "next/image";
import type { Message, ChannelWithDetails, MessageReaction } from "@/lib/chat/types";
import { groupMessagesByDate, formatDateDivider, formatMessageTime, getFilePreviewPath, parseFileContent } from "@/lib/chat/utils";
import { getReactionsForMessages } from "@/lib/chat/actions";
import { triggerDownload, triggerDownloadAll } from "@/lib/utils/download";
import { DownloadSimple } from "phosphor-react";
import { useChatFileUrl, useChatFileUrls } from "./ChatFileUrlsContext";
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

function GridImage({ storagePath, previewPath, fileName }: { storagePath: string; previewPath: string; fileName: string }) {
  const previewUrl = useChatFileUrl(previewPath);
  const originalUrl = useChatFileUrl(storagePath);

  if (!previewUrl) {
    return (
      <div className="w-full h-28 bg-slate-100 rounded-xl animate-pulse flex items-center justify-center">
        <span className="text-[10px] text-slate-400">로딩 중...</span>
      </div>
    );
  }
  const downloadUrl = originalUrl ?? previewUrl;
  return (
    <div className="relative group">
      <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="block">
        <Image
          src={previewUrl}
          alt={fileName}
          width={320}
          height={112}
          unoptimized
          className="w-full h-28 rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
        />
      </a>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          triggerDownload(downloadUrl, fileName);
        }}
        aria-label="이미지 저장"
        title="저장"
        className="absolute top-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/45 text-white opacity-100 transition-opacity hover:bg-black/65 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <DownloadSimple size={14} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}

// --- ImageGroupRenderer: renders a grid of consecutive images ---

function ImageGroupRenderer({ chunk, isOwn }: { chunk: Extract<MessageChunk, { type: "image-group" }>; isOwn: boolean }) {
  const firstMsg = chunk.messages[0];
  const profile = firstMsg.user_profile;
  const lastMsg = chunk.messages[chunk.messages.length - 1];
  const cols = chunk.messages.length === 2 ? "grid-cols-2" : "grid-cols-3";

  const { urls, ensure } = useChatFileUrls();
  const groupFiles = useMemo(
    () =>
      chunk.messages
        .map((msg) => parseFileContent(msg.content))
        .filter((file): file is NonNullable<typeof file> => file !== null)
        .map((file) => ({ path: file.path, name: file.name })),
    [chunk.messages]
  );

  useEffect(() => {
    ensure(groupFiles.map((f) => f.path));
  }, [ensure, groupFiles]);

  const handleDownloadAll = () => {
    const ready = groupFiles.flatMap((f) => {
      const url = urls[f.path];
      return url ? [{ url, fileName: f.name }] : [];
    });
    if (ready.length === 0) return;
    void triggerDownloadAll(ready);
  };

  const downloadAllButton = (
    <button
      type="button"
      onClick={handleDownloadAll}
      title="전체 저장"
      className="inline-flex items-center gap-0.5 text-[10px] font-medium text-indigo-500 hover:text-indigo-600"
    >
      <DownloadSimple size={12} weight="bold" aria-hidden="true" />
      전체 저장
    </button>
  );

  if (isOwn) {
    return (
      <div className="flex flex-row-reverse items-start gap-3">
        <div className="space-y-1 text-right max-w-[70%]">
          <div className="flex flex-row-reverse items-end gap-2">
            <span className="text-[10px] text-slate-400">
              {formatMessageTime(lastMsg.created_at)}
            </span>
            {downloadAllButton}
          </div>
          <div className={`grid ${cols} gap-1`}>
            {chunk.messages.map((msg) => {
              const file = parseFileContent(msg.content);
              if (!file) return null;
              const previewPath = getFilePreviewPath(file) ?? file.path;
              return <GridImage key={msg.id} storagePath={file.path} previewPath={previewPath} fileName={file.name} />;
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
          {downloadAllButton}
        </div>
        <div className={`grid ${cols} gap-1`}>
          {chunk.messages.map((msg) => {
            const file = parseFileContent(msg.content);
            if (!file) return null;
            const previewPath = getFilePreviewPath(file) ?? file.path;
            return <GridImage key={msg.id} storagePath={file.path} previewPath={previewPath} fileName={file.name} />;
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
  const [reactionsByMessage, setReactionsByMessage] = useState<Record<string, MessageReaction[]>>({});
  const requestedReactionIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const missing = messages
      .filter((m) => !m.is_deleted && !requestedReactionIds.current.has(m.id))
      .map((m) => m.id);
    if (missing.length === 0) return;

    for (const id of missing) requestedReactionIds.current.add(id);
    let cancelled = false;
    getReactionsForMessages(missing, userId)
      .then((map) => {
        if (cancelled) return;
        setReactionsByMessage((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {
        for (const id of missing) requestedReactionIds.current.delete(id);
      });
    return () => { cancelled = true; };
  }, [messages, userId]);

  const handleReactionsChange = (messageId: string, reactions: MessageReaction[]) => {
    requestedReactionIds.current.add(messageId);
    setReactionsByMessage((prev) => ({ ...prev, [messageId]: reactions }));
  };

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

  const messagesById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

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
              <div key={chunk.message.id} data-message-id={chunk.message.id}>
                <MessageItem
                  message={chunk.message}
                  isOwn={chunk.message.user_id === userId}
                  userId={userId}
                  parentMessage={chunk.message.parent_message_id ? messagesById.get(chunk.message.parent_message_id) ?? null : null}
                  reactions={reactionsByMessage[chunk.message.id] ?? []}
                  onReactionsChange={handleReactionsChange}
                  onEdit={onEditMessage}
                  onDelete={onDeleteMessage}
                  onReply={onReplyMessage}
                  onPin={onPinMessage}
                />
              </div>
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
