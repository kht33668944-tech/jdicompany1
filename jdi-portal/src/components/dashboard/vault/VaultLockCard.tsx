"use client";

// 보관함 탭 공용 잠금 카드 — 계정 보관함의 잠금 화면을 그대로 추출한 것.
// 계정/계약서 탭이 같은 컴포넌트를 써서 디자인·동작(해제 로직, 토스트)이 항상 일치한다.

import { useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils/errors";
import { unlockVault } from "@/lib/vault/actions";
import { VAULT_UNLOCK_TTL_SEC } from "@/lib/vault/constants";

const UNLOCK_MINUTES = Math.round(VAULT_UNLOCK_TTL_SEC / 60);

interface Props {
  title: string;
  description: string;
  onUnlocked: () => void;
}

export default function VaultLockCard({ title, description, onUnlocked }: Props) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUnlock = async () => {
    if (!password.trim() || loading) return;
    setLoading(true);
    try {
      const res = await unlockVault(password);
      if (res.ok) {
        setPassword("");
        onUnlocked();
        toast.success(`잠금이 해제되었습니다. (${UNLOCK_MINUTES}분 유지)`);
      } else {
        toast.error("2차 비밀번호가 올바르지 않습니다.");
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "잠금 해제 실패"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 grid place-items-center text-2xl mx-auto mb-3">🔒</div>
      <h3 className="font-extrabold text-slate-800">{title}</h3>
      <p className="text-sm text-slate-500 mt-2 mb-5">{description}</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
        placeholder="2차 비밀번호"
        className="w-full text-center tracking-widest bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        autoFocus
      />
      <button
        type="button"
        onClick={handleUnlock}
        disabled={loading}
        className="w-full px-5 py-3 rounded-xl bg-[#2563eb] text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
      >
        🔓 잠금 해제
      </button>
      <p className="text-xs text-slate-400 mt-4">{UNLOCK_MINUTES}분 지나면 자동으로 다시 잠깁니다.</p>
    </div>
  );
}
