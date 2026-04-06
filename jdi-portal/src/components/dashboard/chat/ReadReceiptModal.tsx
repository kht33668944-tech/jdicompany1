"use client";

import { useState, useEffect } from "react";
import { X } from "phosphor-react";
import ModalContainer from "@/components/shared/ModalContainer";
import { getReadReceipts } from "@/lib/chat/actions";
import type { MessageReadReceipt } from "@/lib/chat/types";

interface ReadReceiptModalProps {
  messageId: string;
  onClose: () => void;
}

export default function ReadReceiptModal({ messageId, onClose }: ReadReceiptModalProps) {
  const [receipts, setReceipts] = useState<MessageReadReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getReadReceipts(messageId)
      .then(setReceipts)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [messageId]);

  return (
    <ModalContainer onClose={onClose} maxWidth="max-w-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-slate-900">읽은 사람</h3>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
          <X size={18} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3 py-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-9 h-9 bg-slate-100 rounded-full animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-slate-100 rounded animate-pulse w-20" />
                <div className="h-2.5 bg-slate-50 rounded animate-pulse w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-400 py-4 text-center">읽음 정보를 불러오지 못했습니다.</p>
      ) : receipts.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">아직 읽은 사람이 없습니다.</p>
      ) : (
        <div className="space-y-3 max-h-60 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {receipts.map((r) => (
            <div key={r.user_id} className="flex items-center gap-3">
              {r.avatar_url ? (
                <img src={r.avatar_url} alt={r.full_name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-bold flex-shrink-0">
                  {r.full_name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{r.full_name}</p>
                <p className="text-[10px] text-slate-400">
                  {new Date(r.read_at).toLocaleString("ko-KR", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalContainer>
  );
}
