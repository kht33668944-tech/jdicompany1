"use client";

import { CaretLeft, MagnifyingGlass, Tray, DotsThree, Notebook, PushPin } from "phosphor-react";
import type { ChannelWithDetails } from "@/lib/chat/types";

interface ChatHeaderProps {
  channel: ChannelWithDetails;
  onBack?: () => void;
  onSettingsClick: () => void;
  onSearchClick?: () => void;
  onDrawerClick?: () => void;
  onPinnedClick?: () => void;
  pinnedCount?: number;
  onlineCount?: number;
}

export default function ChatHeader({ channel, onBack, onSettingsClick, onSearchClick, onDrawerClick, onPinnedClick, pinnedCount, onlineCount }: ChatHeaderProps) {
  const isMemo = channel.type === "memo";

  return (
    <header className="h-14 sm:h-16 px-3 sm:px-6 flex items-center justify-between border-b border-slate-100 bg-white flex-shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2">
        {onBack && (
          <button
            onClick={onBack}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0"
            aria-label="뒤로 가기"
          >
            <CaretLeft size={20} />
          </button>
        )}
        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-100 rounded-xl sm:rounded-2xl flex items-center justify-center text-slate-600 font-bold text-sm sm:text-base flex-shrink-0">
          {channel.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="text-sm sm:text-base font-bold text-slate-800 truncate">{channel.name}</span>
          {isMemo ? (
            <span className="flex items-center gap-1 text-[10px] bg-slate-100 text-slate-400 rounded px-1.5 py-0.5 flex-shrink-0 whitespace-nowrap">
              <Notebook size={10} />
              메모
            </span>
          ) : (
            <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
              <span className="text-[10px] bg-slate-100 text-slate-400 rounded px-1.5 py-0.5 whitespace-nowrap">
                {channel.member_count}명
              </span>
              {onlineCount != null && onlineCount > 0 && (
                <span className="hidden sm:flex items-center gap-1 text-[10px] bg-green-50 text-green-600 rounded px-1.5 py-0.5 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
                  {onlineCount}명 접속 중
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
        <button
          onClick={onSearchClick}
          className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
          aria-label="검색"
        >
          <MagnifyingGlass size={18} />
        </button>
        <button
          onClick={onPinnedClick}
          className="relative p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
          aria-label="고정된 메시지"
        >
          <PushPin size={18} />
          {pinnedCount != null && pinnedCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
              {pinnedCount}
            </span>
          )}
        </button>
        <button
          onClick={onDrawerClick}
          className="hidden sm:flex p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
          aria-label="채팅방 서랍"
        >
          <Tray size={18} />
        </button>
        <button
          onClick={onSettingsClick}
          className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
          aria-label="채널 설정"
        >
          <DotsThree size={20} weight="bold" />
        </button>
      </div>
    </header>
  );
}
