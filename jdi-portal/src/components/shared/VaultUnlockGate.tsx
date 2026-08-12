"use client";

// 2차 비밀번호 잠금 해제 게이트 — 보관함 잠금(unlockVault)을 재사용하는 화면들의 공용 UI.
// 미설정 안내 / 비밀번호 입력 / 해제 토스트를 한 곳에서 관리한다.

import { useState } from "react";
import { toast } from "sonner";
import LockSimple from "phosphor-react/dist/icons/LockSimple.esm.js";
import { getErrorMessage } from "@/lib/utils/errors";
import { unlockVault } from "@/lib/vault/actions";
import { VAULT_UNLOCK_TTL_SEC } from "@/lib/vault/constants";

const UNLOCK_MINUTES = Math.round(VAULT_UNLOCK_TTL_SEC / 60);

interface Props {
  gateConfigured: boolean;
  /** 잠금 상자에 보여줄 설명 (예: "정산 자료에는 계좌번호·신분증이 들어가요.") */
  notice: React.ReactNode;
  onUnlocked: () => void;
}

export default function VaultUnlockGate({ gateConfigured, notice, onUnlocked }: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!gateConfigured) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-500">
        2차 비밀번호가 아직 설정되지 않았어요. 보관함 → 계정 탭에서 관리자가 설정하면 사용할 수 있어요.
      </p>
    );
  }

  const handleUnlock = async () => {
    if (!password.trim() || busy) return;
    setBusy(true);
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
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3.5">
      <p className="flex items-start gap-1.5 text-sm text-slate-600">
        <LockSimple size={15} weight="fill" className="mt-0.5 shrink-0 text-slate-400" />
        <span>{notice}</span>
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleUnlock();
          }}
          placeholder="2차 비밀번호"
          aria-label="2차 비밀번호"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="button"
          onClick={handleUnlock}
          disabled={busy}
          className="rounded-lg bg-[#2563eb] px-3.5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          잠금 해제
        </button>
      </div>
    </div>
  );
}
