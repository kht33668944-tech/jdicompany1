"use client";

import { useState, useMemo } from "react";
import { Plus, MagnifyingGlass, Star } from "phosphor-react";
import type { ChannelWithDetails, ApprovedProfile } from "@/lib/chat/types";
import ChannelListItem from "./ChannelListItem";
import PersonListItem from "./PersonListItem";

interface ChannelListProps {
  channels: ChannelWithDetails[];
  people: ApprovedProfile[];
  onlineUserIds: Set<string>;
  dmUnreadByPartner: Map<string, number>;
  selectedChannelId?: string;
  selectedPartnerId?: string;
  mutedChannels?: Set<string>;
  favoriteChannels?: Set<string>;
  onSelectChannel: (channel: ChannelWithDetails) => void;
  onSelectPerson: (person: ApprovedProfile) => void;
  onCreateClick: () => void;
}

export default function ChannelList({
  channels,
  people,
  onlineUserIds,
  dmUnreadByPartner,
  selectedChannelId,
  selectedPartnerId,
  mutedChannels = new Set(),
  favoriteChannels = new Set(),
  onSelectChannel,
  onSelectPerson,
  onCreateClick,
}: ChannelListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const q = searchQuery.trim().toLowerCase();

  const memoChannel = channels.find((ch) => ch.type === "memo");
  const groupChannels = channels.filter((ch) => ch.type === "group");

  const filteredGroupChannels = groupChannels.filter((ch) => {
    if (!q) return true;
    return (
      ch.name.toLowerCase().includes(q) ||
      ch.last_message?.content.toLowerCase().includes(q)
    );
  });

  const filteredMemo =
    memoChannel &&
    (!q ||
      "나만의 메모".includes(q) ||
      memoChannel.last_message?.content.toLowerCase().includes(q))
      ? memoChannel
      : null;

  const sortedGroupChannels = useMemo(
    () =>
      [...filteredGroupChannels].sort((a, b) => {
        const aTime = a.last_message?.created_at ?? a.updated_at;
        const bTime = b.last_message?.created_at ?? b.updated_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      }),
    [filteredGroupChannels]
  );
  const favoriteGroupChannels = sortedGroupChannels.filter((ch) => favoriteChannels.has(ch.id));
  const nonFavoriteGroupChannels = sortedGroupChannels.filter((ch) => !favoriteChannels.has(ch.id));

  const filteredPeople = useMemo(
    () =>
      people.filter((p) => {
        if (!q) return true;
        return (
          p.full_name.toLowerCase().includes(q) ||
          (p.department ?? "").toLowerCase().includes(q)
        );
      }),
    [people, q]
  );

  const nothingMatches =
    q && sortedGroupChannels.length === 0 && !filteredMemo && filteredPeople.length === 0;

  return (
    <aside className="w-full sm:w-80 flex-shrink-0 border-r border-slate-100 flex flex-col bg-white">
      <div className="px-4 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-2xl font-bold text-slate-800">채팅</h1>
        <button
          onClick={onCreateClick}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
          title="새 그룹 만들기"
          aria-label="새 그룹 만들기"
        >
          <Plus size={18} weight="bold" className="text-slate-600" />
        </button>
      </div>

      <div className="px-4 pb-3 flex-shrink-0">
        <div className="relative group">
          <MagnifyingGlass
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="채널·직원·메시지 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
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

        {nonFavoriteGroupChannels.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 py-1">
              채널
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

        {filteredPeople.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 py-1 mt-2">
              직원
            </p>
            {filteredPeople.map((p) => (
              <PersonListItem
                key={p.id}
                person={p}
                isOnline={onlineUserIds.has(p.id)}
                unreadCount={dmUnreadByPartner.get(p.id) ?? 0}
                isSelected={selectedPartnerId === p.id}
                onClick={() => onSelectPerson(p)}
              />
            ))}
          </>
        )}

        {nothingMatches && (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <MagnifyingGlass size={24} className="mb-2" />
            <p className="text-sm">검색 결과가 없습니다</p>
          </div>
        )}
      </div>
    </aside>
  );
}
