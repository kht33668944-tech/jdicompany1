"use client";

import { useState } from "react";
import { Plus, MagnifyingGlass, Star } from "phosphor-react";
import type { ChannelWithDetails } from "@/lib/chat/types";
import ChannelListItem from "./ChannelListItem";

interface ChannelListProps {
  channels: ChannelWithDetails[];
  selectedChannelId?: string;
  mutedChannels?: Set<string>;
  favoriteChannels?: Set<string>;
  onSelectChannel: (channel: ChannelWithDetails) => void;
  onCreateClick: () => void;
}

export default function ChannelList({
  channels,
  selectedChannelId,
  mutedChannels = new Set(),
  favoriteChannels = new Set(),
  onSelectChannel,
  onCreateClick,
}: ChannelListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const memoChannel = channels.find((ch) => ch.type === "memo");
  const groupChannels = channels.filter((ch) => ch.type !== "memo");

  const filteredGroupChannels = groupChannels.filter((ch) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      ch.name.toLowerCase().includes(q) ||
      ch.last_message?.content.toLowerCase().includes(q)
    );
  });

  const filteredMemo =
    memoChannel &&
    (!searchQuery.trim() ||
      "나만의 메모".includes(searchQuery.toLowerCase()) ||
      memoChannel.last_message?.content.toLowerCase().includes(searchQuery.toLowerCase()))
      ? memoChannel
      : null;

  // Sort group channels by last message time descending
  const sortedGroupChannels = [...filteredGroupChannels].sort((a, b) => {
    const aTime = a.last_message?.created_at ?? a.updated_at;
    const bTime = b.last_message?.created_at ?? b.updated_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  const favoriteGroupChannels = sortedGroupChannels.filter((ch) => favoriteChannels.has(ch.id));
  const nonFavoriteGroupChannels = sortedGroupChannels.filter((ch) => !favoriteChannels.has(ch.id));

  return (
    <aside className="w-full sm:w-80 flex-shrink-0 border-r border-slate-100 flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-2xl font-bold text-slate-800">채팅</h1>
        <button
          onClick={onCreateClick}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
          title="새 채널 만들기"
          aria-label="새 채널 만들기"
        >
          <Plus size={18} weight="bold" className="text-slate-600" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-3 flex-shrink-0">
        <div className="relative group">
          <MagnifyingGlass
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="채널 또는 메시지 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all outline-none"
          />
        </div>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
        {/* Memo channel pinned at top */}
        {filteredMemo && (
          <div className="mb-3">
            <ChannelListItem
              channel={filteredMemo}
              isSelected={selectedChannelId === filteredMemo.id}
              isMemo
              onClick={() => onSelectChannel(filteredMemo)}
            />
          </div>
        )}

        {/* Favorite channels */}
        {favoriteGroupChannels.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 py-1 flex items-center gap-1">
              <Star size={11} weight="fill" className="text-amber-400" />
              즐겨찾기
            </p>
            {favoriteGroupChannels.map((ch) => (
              <ChannelListItem
                key={ch.id}
                channel={ch}
                isSelected={selectedChannelId === ch.id}
                isMemo={false}
                isMuted={mutedChannels.has(ch.id)}
                isFavorite
                onClick={() => onSelectChannel(ch)}
              />
            ))}
          </>
        )}

        {/* Group channels */}
        {nonFavoriteGroupChannels.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 py-1">
              최근 대화
            </p>
            {nonFavoriteGroupChannels.map((ch) => (
              <ChannelListItem
                key={ch.id}
                channel={ch}
                isSelected={selectedChannelId === ch.id}
                isMemo={false}
                isMuted={mutedChannels.has(ch.id)}
                onClick={() => onSelectChannel(ch)}
              />
            ))}
          </>
        )}

        {/* Empty search result */}
        {sortedGroupChannels.length === 0 && !filteredMemo && searchQuery.trim() && (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <MagnifyingGlass size={24} className="mb-2" />
            <p className="text-sm">검색 결과가 없습니다</p>
          </div>
        )}
      </div>
    </aside>
  );
}
