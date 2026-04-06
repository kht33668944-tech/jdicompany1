"use client";

import { useEffect, useRef } from "react";
import { X, PushPin } from "phosphor-react";
import type { Message } from "@/lib/chat/types";
import { formatMessageTime } from "@/lib/chat/utils";

interface PinnedMessagesPanelProps {
  open: boolean;
  messages: Message[];
  onClose: () => void;
  onUnpin: (message: Message) => void;
}

export default function PinnedMessagesPanel({ open, messages, onClose, onUnpin }: PinnedMessagesPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute top-16 right-4 z-30 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <PushPin size={15} weight="fill" className="text-amber-500" />
          고정된 메시지
          {messages.length > 0 && (
            <span className="text-xs font-normal text-slate-400">({messages.length})</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
          aria-label="닫기"
        >
          <X size={16} />
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {messages.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-400">
            고정된 메시지가 없습니다
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {messages.map((msg) => (
              <li key={msg.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-bold text-slate-700 truncate">
                      {msg.user_profile?.full_name ?? "알 수 없음"}
                    </span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">
                      {formatMessageTime(msg.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate leading-relaxed">
                    {msg.is_deleted ? "삭제된 메시지입니다" : msg.content}
                  </p>
                </div>
                <button
                  onClick={() => onUnpin(msg)}
                  className="flex-shrink-0 p-1.5 text-slate-300 hover:text-amber-500 rounded-lg hover:bg-amber-50 transition-colors"
                  aria-label="고정 해제"
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
