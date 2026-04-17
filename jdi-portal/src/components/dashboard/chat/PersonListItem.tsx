"use client";

import type { ApprovedProfile } from "@/lib/chat/types";

interface PersonListItemProps {
  person: ApprovedProfile;
  isOnline: boolean;
  unreadCount: number;
  isSelected: boolean;
  onClick: () => void;
}

export default function PersonListItem({
  person,
  isOnline,
  unreadCount,
  isSelected,
  onClick,
}: PersonListItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors relative ${
        isSelected ? "bg-slate-100" : "hover:bg-slate-50"
      }`}
    >
      {isSelected && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 rounded-r-full" />
      )}
      <div className="relative flex-shrink-0">
        <div className={`w-8 h-8 rounded-full overflow-hidden bg-slate-200 ${isOnline ? "" : "opacity-70"}`}>
          {person.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={person.avatar_url} alt={person.full_name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">
              {person.full_name.charAt(0)}
            </div>
          )}
        </div>
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
            isOnline ? "bg-emerald-500" : "bg-slate-300"
          }`}
          aria-label={isOnline ? "온라인" : "오프라인"}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{person.full_name}</p>
        {person.department && (
          <p className="text-[11px] text-slate-400 truncate">{person.department}</p>
        )}
      </div>
      {unreadCount > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
