"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Pencil, Trash, File as FileIcon, DownloadSimple, Copy, ArrowBendUpLeft, Smiley, PushPin } from "phosphor-react";
import { toast } from "sonner";
import type { Message, MessageReaction } from "@/lib/chat/types";
import { formatMessageTime, formatFileSize, parseFileContent } from "@/lib/chat/utils";
import { getChatFileUrl, toggleReaction, getReactions } from "@/lib/chat/actions";
import { parseMessageContent } from "@/lib/chat/mentions";
import { useChatFileUrls } from "./ChatFileUrlsContext";
import ReadReceiptModal from "./ReadReceiptModal";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "🎉"];

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  userId: string;
  parentMessage?: Message | null;
  onEdit?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  onReply?: (message: Message) => void;
  onPin?: (message: Message) => void;
}

function getParentPreview(parent: Message | null | undefined): string {
  if (!parent) return "원본 메시지로 이동";
  if (parent.is_deleted) return "삭제된 메시지";
  if (parent.type === "image") return "사진";
  if (parent.type === "file") {
    const f = parseFileContent(parent.content);
    return f ? f.name : "파일";
  }
  return parent.content;
}

interface ContextMenuState {
  x: number;
  y: number;
}

/** 리액션 바 */
function ReactionBar({ message, userId }: { message: Message; userId: string }) {
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  // loaded 를 별도 상태로 두지 않고, "어떤 메시지에 대해 로드 끝났는지" 로 추적
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loaded = loadedFor === message.id;

  useEffect(() => {
    let cancelled = false;
    getReactions(message.id, userId)
      .then((r) => {
        if (cancelled) return;
        setReactions(r);
        setLoadedFor(message.id);
      })
      .catch(() => {
        if (!cancelled) setLoadedFor(message.id);
      });
    return () => { cancelled = true; };
  }, [message.id, userId]);

  async function handleToggle(emoji: string) {
    try {
      await toggleReaction(message.id, emoji);
      const updated = await getReactions(message.id, userId);
      setReactions(updated);
    } catch { /* ignore */ }
  }

  if (!loaded || reactions.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => handleToggle(r.emoji)}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
            r.reacted
              ? "bg-blue-50 border-blue-200 text-blue-600"
              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <span>{r.emoji}</span>
          <span className="text-[10px] font-medium">{r.count}</span>
        </button>
      ))}
    </div>
  );
}

/** 메시지 컨텍스트 메뉴 */
function MessageContextMenu({
  x,
  y,
  message,
  isOwn,
  onEdit,
  onDelete,
  onReply,
  onReact,
  onPin,
  onClose,
}: {
  x: number;
  y: number;
  message: Message;
  isOwn: boolean;
  onEdit?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  onReply?: (message: Message) => void;
  onReact?: () => void;
  onPin?: (message: Message) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isTextMessage = message.type === "text" && !message.is_deleted;

  // 뷰포트 경계 체크 후 위치 조정
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let adjustedX = x;
      let adjustedY = y;
      if (x + rect.width > vw) adjustedX = vw - rect.width - 8;
      if (y + rect.height > vh) adjustedY = vh - rect.height - 8;
      if (adjustedX < 8) adjustedX = 8;
      if (adjustedY < 8) adjustedY = 8;
      // 렌더 후 DOM 측정 → 위치 보정 (legitimate measurement effect)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPos({ x: adjustedX, y: adjustedY });
    }
  }, [x, y]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [onClose]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      toast.success("복사되었습니다");
    });
    onClose();
  };

  const handleReply = () => {
    onReply?.(message);
    onClose();
  };

  const handleReact = () => {
    onReact?.();
    onClose();
  };

  const handleEdit = () => {
    onEdit?.(message);
    onClose();
  };

  const handleDelete = () => {
    onDelete?.(message);
    onClose();
  };

  const handlePin = () => {
    onPin?.(message);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 50 }}
      className="bg-white rounded-xl shadow-lg border border-slate-100 py-1 min-w-[120px]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {isTextMessage && (
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Copy size={14} className="text-slate-400" />
          복사
        </button>
      )}
      <button
        onClick={handleReply}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <ArrowBendUpLeft size={14} className="text-slate-400" />
        답장
      </button>
      {!message.is_deleted && (
        <button
          onClick={handleReact}
          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Smiley size={14} className="text-slate-400" />
          리액션
        </button>
      )}
      {!message.is_deleted && (
        <button
          onClick={handlePin}
          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <PushPin size={14} className="text-slate-400" />
          {message.is_pinned ? "고정 해제" : "고정"}
        </button>
      )}
      {isOwn && isTextMessage && (
        <button
          onClick={handleEdit}
          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Pencil size={14} className="text-slate-400" />
          수정
        </button>
      )}
      {isOwn && !message.is_deleted && (
        <button
          onClick={handleDelete}
          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-slate-50 transition-colors"
        >
          <Trash size={14} className="text-red-400" />
          삭제
        </button>
      )}
    </div>
  );
}

function ReadCountButton({ message }: { message: Message }) {
  const [showModal, setShowModal] = useState(false);
  const readCount = message.read_by?.length ?? 0;
  if (readCount === 0) return null;
  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="text-[10px] font-bold text-blue-600 hover:underline"
      >
        {readCount}명 읽음
      </button>
      {showModal && (
        <ReadReceiptModal messageId={message.id} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}

/** 이미지 메시지 렌더러 */
function ChatImage({ storagePath, fileName }: { storagePath: string; fileName: string }) {
  const { urls: batchUrls } = useChatFileUrls();
  const batched = batchUrls[storagePath];
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

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
      <div className="px-4 py-3 bg-red-50 rounded-xl text-xs text-red-400">
        이미지를 불러올 수 없습니다
      </div>
    );
  }

  if (!url) {
    return (
      <div className="w-48 h-32 bg-slate-100 rounded-xl animate-pulse flex items-center justify-center">
        <span className="text-[10px] text-slate-400">로딩 중...</span>
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={url}
        alt={fileName}
        className="max-w-[280px] max-h-[200px] rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
      />
    </a>
  );
}

/** 파일 메시지 렌더러 */
function ChatFile({ storagePath, fileName, fileSize }: { storagePath: string; fileName: string; fileSize: number }) {
  const { urls: batchUrls } = useChatFileUrls();
  const batched = batchUrls[storagePath];
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  useEffect(() => {
    if (batched) return;
    let cancelled = false;
    getChatFileUrl(storagePath)
      .then((u) => { if (!cancelled) setFallbackUrl(u); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [storagePath, batched]);

  const url = batched ?? fallbackUrl;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl min-w-[200px]">
      <FileIcon size={24} className="text-slate-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{fileName}</p>
        <p className="text-[10px] text-slate-400">{formatFileSize(fileSize)}</p>
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors">
          <DownloadSimple size={16} className="text-slate-500" />
        </a>
      )}
    </div>
  );
}

/** 메시지 본문 렌더링 (텍스트/이미지/파일) */
function MessageContent({ message, isOwn, parentMessage }: { message: Message; isOwn: boolean; parentMessage?: Message | null }) {
  const isReply = !!message.parent_message_id;
  const parentName = parentMessage?.user_profile?.full_name ?? "";
  const parentPreview = getParentPreview(parentMessage);

  if (message.is_deleted) {
    return (
      <div className={`inline-block px-3 py-2 sm:px-4 sm:py-2.5 ${isOwn ? "bg-slate-100 rounded-2xl rounded-tr-md" : "bg-white border border-slate-100 rounded-2xl rounded-tl-md shadow-sm"} text-[13px] sm:text-sm leading-relaxed`}>
        <span className="text-slate-400 italic">삭제된 메시지입니다</span>
      </div>
    );
  }

  // 이미지/파일 메시지
  if (message.type === "image" || message.type === "file") {
    const fileData = parseFileContent(message.content);
    if (fileData) {
      if (message.type === "image") {
        return <ChatImage storagePath={fileData.path} fileName={fileData.name} />;
      }
      return <ChatFile storagePath={fileData.path} fileName={fileData.name} fileSize={fileData.size} />;
    }
  }

  // 텍스트 메시지 — Discord 스타일: 버블 위에 떠 있는 가벼운 인라인 답글 라인
  const parentAvatar = parentMessage?.user_profile?.avatar_url ?? null;

  return (
    <div className="inline-flex flex-col max-w-full">
      {isReply && message.parent_message_id && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const target = document.querySelector<HTMLElement>(`[data-message-id="${message.parent_message_id}"]`);
            if (target) {
              target.scrollIntoView({ behavior: "smooth", block: "center" });
              target.classList.add("ring-2", "ring-blue-400");
              setTimeout(() => target.classList.remove("ring-2", "ring-blue-400"), 1500);
            }
          }}
          className={`group flex items-center gap-1 mb-0.5 px-2 max-w-full overflow-hidden hover:opacity-100 opacity-75 transition-opacity ${
            isOwn ? "self-end flex-row-reverse" : "self-start"
          }`}
        >
          {/* 곡선 커넥터 */}
          <svg
            width="14"
            height="10"
            viewBox="0 0 14 10"
            className="flex-shrink-0 text-slate-300"
            fill="none"
            style={isOwn ? { transform: "scaleX(-1)" } : undefined}
          >
            <path d="M1 9 V4 Q1 1 4 1 H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {parentAvatar && (
            <img
              src={parentAvatar}
              alt={parentName}
              className="w-4 h-4 rounded-full flex-shrink-0 object-cover"
            />
          )}
          <span className="text-[11px] font-semibold text-slate-600 flex-shrink-0">
            {parentName || "답장"}
          </span>
          <span className="text-[11px] text-slate-400 truncate min-w-0">
            {parentPreview}
          </span>
        </button>
      )}
      <div className={`inline-block whitespace-pre-wrap px-3 py-2 sm:px-4 sm:py-2.5 ${isOwn ? "bg-blue-600 text-white rounded-2xl rounded-tr-md self-end" : "bg-white border border-slate-100 rounded-2xl rounded-tl-md text-slate-700 shadow-sm self-start"} text-[13px] sm:text-sm leading-relaxed`}>
        {parseMessageContent(message.content).map((seg, i) =>
          seg.type === "text" ? (
            <span key={i}>{seg.text}</span>
          ) : (
            <span
              key={i}
              className={`inline-flex items-center px-1 rounded font-medium ${
                isOwn ? "bg-blue-500/40 text-white" : "bg-blue-100 text-blue-700"
              }`}
            >
              @{seg.displayName}
            </span>
          )
        )}
        {message.is_edited && (
          <span className={`text-[10px] ml-1 ${isOwn ? "text-blue-200" : "text-slate-400"}`}>(수정됨)</span>
        )}
      </div>
    </div>
  );
}

export default function MessageItem({
  message,
  isOwn,
  userId,
  parentMessage,
  onEdit,
  onDelete,
  onReply,
  onPin,
}: MessageItemProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMoved = useRef(false);

  const openContextMenu = useCallback((x: number, y: number) => {
    setContextMenu({ x, y });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY);
  }, [openContextMenu]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchMoved.current = false;
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        openContextMenu(touch.clientX, touch.clientY);
      }
    }, 500);
  }, [openContextMenu]);

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  const touchHandlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };

  // System message
  if (message.type === "system") {
    return (
      <div className="flex justify-center">
        <span className="px-3 py-1 bg-slate-100 text-[11px] text-slate-500 rounded-full font-medium">
          {message.content}
        </span>
      </div>
    );
  }

  // Own message (right-aligned)
  if (isOwn) {
    return (
      <>
        <div className="flex flex-row-reverse items-start gap-2 sm:gap-3">
          <div className="space-y-0.5 sm:space-y-1 text-right max-w-[75%] sm:max-w-[70%]">
            <div className="flex flex-row-reverse items-end gap-2">
              <span className="text-[10px] text-slate-400">
                {formatMessageTime(message.created_at)}
              </span>
            </div>
            {message.is_pinned && (
              <div className="flex flex-row-reverse">
                <PushPin size={12} className="text-amber-500" weight="fill" />
              </div>
            )}
            <div
              className="inline-block cursor-default select-none text-left"
              onContextMenu={handleContextMenu}
              {...touchHandlers}
            >
              <MessageContent message={message} isOwn parentMessage={parentMessage} />
            </div>
            {!message.is_deleted && (
              <ReactionBar message={message} userId={userId} />
            )}
            {!message.is_deleted && <ReadCountButton message={message} />}
          </div>
        </div>
        {contextMenu && (
          <MessageContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            message={message}
            isOwn={isOwn}
            onEdit={onEdit}
            onDelete={onDelete}
            onReply={onReply}
            onReact={() => setShowReactionPicker(true)}
            onPin={onPin}
            onClose={closeContextMenu}
          />
        )}
        {showReactionPicker && (
          <div className="flex justify-end mt-1">
            <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-2 flex gap-1 z-20">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={async () => {
                    try {
                      await toggleReaction(message.id, emoji);
                    } catch { /* ignore */ }
                    setShowReactionPicker(false);
                  }}
                  className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-base transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  // Other's message (left-aligned)
  return (
    <>
      <div className="flex items-start gap-2 sm:gap-3">
        {message.user_profile?.avatar_url ? (
          <img
            src={message.user_profile.avatar_url}
            alt={message.user_profile.full_name ?? ""}
            className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex-shrink-0 object-cover"
          />
        ) : (
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-indigo-100 flex-shrink-0 flex items-center justify-center text-indigo-600 font-bold text-xs sm:text-sm">
            {message.user_profile?.full_name?.charAt(0) ?? "?"}
          </div>
        )}
        <div className="space-y-0.5 sm:space-y-1 max-w-[75%] sm:max-w-[70%]">
          <div className="flex items-end gap-1.5 sm:gap-2">
            <span className="text-[11px] sm:text-xs font-bold text-slate-800">
              {message.user_profile?.full_name}
            </span>
            <span className="text-[10px] text-slate-400">
              {formatMessageTime(message.created_at)}
            </span>
          </div>
          {message.is_pinned && (
            <div className="flex">
              <PushPin size={12} className="text-amber-500" weight="fill" />
            </div>
          )}
          <div
            className="inline-block cursor-default select-none"
            onContextMenu={handleContextMenu}
            {...touchHandlers}
          >
            <MessageContent message={message} isOwn={false} parentMessage={parentMessage} />
          </div>
          {!message.is_deleted && (
            <ReactionBar message={message} userId={userId} />
          )}
          {!message.is_deleted && <ReadCountButton message={message} />}
        </div>
      </div>
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          message={message}
          isOwn={isOwn}
          onEdit={onEdit}
          onDelete={onDelete}
          onReply={onReply}
          onReact={() => setShowReactionPicker(true)}
          onPin={onPin}
          onClose={closeContextMenu}
        />
      )}
      {showReactionPicker && (
        <div className="flex justify-start mt-1 pl-12">
          <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-2 flex gap-1 z-20">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={async () => {
                  try {
                    await toggleReaction(message.id, emoji);
                  } catch { /* ignore */ }
                  setShowReactionPicker(false);
                }}
                className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-base transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
