"use client";

import { Notebook, BellSlash, Star } from "phosphor-react";
import type { ChannelWithDetails } from "@/lib/chat/types";
import { formatChannelTime, parseFileContent } from "@/lib/chat/utils";
import AvatarStack from "./AvatarStack";

interface ChannelListItemProps {
  channel: ChannelWithDetails;
  isSelected: boolean;
  isMemo: boolean;
  isMuted?: boolean;
  isFavorite?: boolean;
  onClick: () => void;
}

export default function ChannelListItem({
  channel,
  isSelected,
  isMemo,
  isMuted = false,
  isFavorite = false,
  onClick,
}: ChannelListItemProps) {
  const lastMsgTime =
    channel.last_message?.created_at
      ? formatChannelTime(channel.last_message.created_at)
      : "";

  function getContentPreview() {
    if (!channel.last_message) return "메시지가 없습니다";
    const msg = channel.last_message;
    if (msg.type === "system") return msg.content;
    let content = msg.content;
    if (msg.type === "image") content = "사진";
    else if (msg.type === "file") {
      content = parseFileContent(msg.content)?.name ?? "파일";
    }
    return `${msg.user_name}: ${content}`;
  }
  const lastMsgPreview = getContentPreview();

  if (isMemo) {
    return (
      <button
        onClick={onClick}
        className={`w-full text-left flex items-center gap-3 p-4 rounded-2xl transition-colors border ${
          isSelected
            ? "bg-blue-100/70 border-blue-200"
            : "bg-blue-50/50 border-blue-100/50 hover:bg-blue-50"
        }`}
      >
        <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
          <Notebook size={18} weight="fill" className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-blue-900 truncate">나만의 메모</p>
          {channel.last_message && (
            <p className="text-xs text-blue-600/70 truncate mt-0.5">
              {channel.last_message.type === "image" ? "사진" : channel.last_message.type === "file" ? (parseFileContent(channel.last_message.content)?.name ?? "파일") : channel.last_message.content}
            </p>
          )}
        </div>
        {lastMsgTime && (
          <span className="text-[11px] text-blue-400 flex-shrink-0">{lastMsgTime}</span>
        )}
      </button>
    );
  }

  const isDm = channel.type === "dm";
  const dmPartner = isDm ? channel.members_preview?.[0] ?? null : null;
  const displayName = isDm ? dmPartner?.full_name ?? "(알 수 없음)" : channel.name;
  const initial = displayName.charAt(0).toUpperCase();
  const groupMembers = !isDm ? channel.members_preview ?? [] : [];
  const groupTotalOthers = !isDm ? Math.max(0, (channel.member_count ?? 0) - 1) : 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 p-4 rounded-2xl transition-colors relative ${
        isSelected ? "bg-slate-100" : "hover:bg-slate-50"
      }`}
    >
      {isSelected && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 rounded-r-full" />
      )}
      <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0 text-sm font-bold text-slate-600 overflow-hidden">
        {isDm && dmPartner?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dmPartner.avatar_url} alt={dmPartner.full_name} className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <p className={`text-sm truncate ${isSelected ? "font-bold text-slate-800" : "font-semibold text-slate-700"}`}>
              {displayName}
            </p>
            {isFavorite && <Star size={13} weight="fill" className="text-amber-400 flex-shrink-0" />}
            {isMuted && <BellSlash size={13} className="text-slate-400 flex-shrink-0" />}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {lastMsgTime && (
              <span className="text-[11px] text-slate-400">{lastMsgTime}</span>
            )}
            {channel.unread_count > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {channel.unread_count > 99 ? "99+" : channel.unread_count}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs text-slate-400 truncate flex-1 min-w-0">{lastMsgPreview}</p>
          {!isDm && groupMembers.length > 0 && (
            <div className="flex-shrink-0">
              <AvatarStack members={groupMembers} totalCount={groupTotalOthers} max={3} size={18} />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
