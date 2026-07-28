"use client";

import { useState } from "react";
import { toast } from "sonner";
import { unlockVault } from "@/lib/vault/actions";

interface Props {
  onUnlocked: () => void;
  onCancel: () => void;
}

/**
 * 민감 서류(신분증·통장)를 열 때 뜨는 2차 비밀번호 입력창.
 * 보관함과 같은 비밀번호이고, 한 번 풀면 20분간 양쪽 모두 열린다.
 */
export default function UnlockPrompt({ onUnlocked, onCancel }: Props) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUnlock = async () => {
    if (!password.trim()) return;
    setLoading(true);
    try {
      const res = await unlockVault(password);
      if (res.ok) {
        setPassword("");
        toast.success("잠금이 해제되었습니다. (20분 유지)");
        onUnlocked();
      } else {
        toast.error("2차 비밀번호가 올바르지 않습니다.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "잠금 해제 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl space-y-3">
        <h3 className="text-sm font-bold text-slate-800">2차 비밀번호</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          신분증·통장 사본은 보호된 서류입니다. 보관함과 같은 2차 비밀번호를 입력해주세요.
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleUnlock();
          }}
          placeholder="2차 비밀번호"
          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleUnlock}
            disabled={loading || !password.trim()}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "확인 중…" : "잠금 해제"}
          </button>
        </div>
      </div>
    </div>
  );
}
