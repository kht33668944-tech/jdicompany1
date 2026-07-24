"use client";

import { useState } from "react";
import { toast } from "sonner";
import { setGatePassword } from "@/lib/vault/actions";
import { useOverlayDismiss } from "@/components/shared/useOverlayDismiss";

interface Props {
  isInitial: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function GatePasswordModal({ isInitial, onClose, onSaved }: Props) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const overlay = useOverlayDismiss(onClose);

  const handleSave = async () => {
    if (busy) return;
    if (pw.trim().length < 4) {
      toast.error("2차 비밀번호는 4자 이상이어야 합니다.");
      return;
    }
    if (pw !== pw2) {
      toast.error("두 비밀번호가 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    try {
      await setGatePassword(pw);
      toast.success(isInitial ? "2차 비밀번호가 설정되었습니다." : "2차 비밀번호가 변경되었습니다.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "설정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/20 backdrop-blur-sm" {...overlay}>
      <div className="w-full max-w-sm rounded-[28px] shadow-2xl bg-white p-6 space-y-4">
        <h2 className="text-lg font-extrabold text-slate-900 ml-1">{isInitial ? "2차 비밀번호 설정" : "2차 비밀번호 변경"}</h2>
        <p className="text-sm text-slate-500 ml-1">계정 보관함에 들어갈 때 쓰는 공용 비밀번호입니다. 직원끼리만 공유하세요.</p>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="새 2차 비밀번호(4자 이상)" className={inputCls} autoFocus autoComplete="new-password" />
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="한 번 더 입력" className={inputCls} autoComplete="new-password" onKeyDown={(e) => e.key === "Enter" && handleSave()} />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="px-6 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-100 disabled:opacity-50">취소</button>
          <button type="button" onClick={handleSave} disabled={busy} className="px-6 py-2.5 rounded-xl bg-[#2563eb] text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50">
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
