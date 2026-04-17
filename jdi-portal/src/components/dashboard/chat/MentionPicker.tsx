"use client";

import { useEffect, useRef } from "react";
import type { MemberPreview } from "@/lib/chat/types";

interface MentionPickerProps {
  candidates: MemberPreview[];
  activeIndex: number;
  onSelect: (member: MemberPreview) => void;
  onClose: () => void;
}

export default function MentionPicker({
  candidates,
  activeIndex,
  onSelect,
  onClose,
}: MentionPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  if (candidates.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto z-20"
    >
      {candidates.map((m, i) => (
        <button
          key={m.id}
          onClick={() => onSelect(m)}
          className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
            i === activeIndex ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-700"
          }`}
        >
          <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
            {m.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.avatar_url} alt={m.full_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-500">
                {m.full_name.charAt(0)}
              </div>
            )}
          </div>
          <span className="truncate">{m.full_name}</span>
        </button>
      ))}
    </div>
  );
}
