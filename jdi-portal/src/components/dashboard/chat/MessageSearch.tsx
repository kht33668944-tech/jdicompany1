"use client";

import { useState, useRef } from "react";
import { MagnifyingGlass, X } from "phosphor-react";
import { searchMessages } from "@/lib/chat/actions";
import { formatMessageTime } from "@/lib/chat/utils";

interface MessageSearchProps {
  channelId: string;
  onClose: () => void;
}

export default function MessageSearch({ channelId, onClose }: MessageSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; content: string; created_at: string; user_name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchMessages(channelId, value.trim());
        setResults(data);
        setSearched(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  return (
    <div className="absolute top-16 left-0 right-0 z-20 bg-white border-b border-slate-100 shadow-lg">
      {/* Search input */}
      <div className="px-4 py-3 flex items-center gap-2">
        <MagnifyingGlass size={16} className="text-slate-400 flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="메시지 검색..."
          autoFocus
          className="flex-1 text-sm outline-none bg-transparent"
        />
        {loading && (
          <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
        )}
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors flex-shrink-0"
          aria-label="검색 닫기"
        >
          <X size={16} />
        </button>
      </div>

      {/* Results */}
      {searched && (
        <div className="max-h-64 overflow-y-auto border-t border-slate-50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              검색 결과가 없습니다
            </div>
          ) : (
            <div className="py-1">
              {results.map((r) => (
                <div
                  key={r.id}
                  className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold text-slate-700">{r.user_name}</span>
                    <span className="text-[10px] text-slate-400">{formatMessageTime(r.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2">{r.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
