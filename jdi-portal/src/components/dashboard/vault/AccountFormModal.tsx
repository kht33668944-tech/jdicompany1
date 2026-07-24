"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { VaultAccount } from "@/lib/vault/types";
import { createAccount, updateAccount } from "@/lib/vault/actions";
import { useOverlayDismiss } from "@/components/shared/useOverlayDismiss";

interface Props {
  editAccount: VaultAccount | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function AccountFormModal({ editAccount, onClose, onSaved }: Props) {
  const isEdit = !!editAccount;
  const [serviceName, setServiceName] = useState(editAccount?.service_name ?? "");
  const [username, setUsername] = useState(editAccount?.username ?? "");
  const [password, setPassword] = useState(editAccount?.password ?? "");
  const [secondary, setSecondary] = useState(editAccount?.secondary ?? "");
  const [url, setUrl] = useState(editAccount?.url ?? "");
  const [note, setNote] = useState(editAccount?.note ?? "");
  const [tags, setTags] = useState(editAccount?.tags.join(", ") ?? "");
  const [busy, setBusy] = useState(false);
  const overlay = useOverlayDismiss(onClose);

  const handleSave = async () => {
    if (busy) return;
    if (!serviceName.trim()) {
      toast.error("서비스명을 입력해주세요.");
      return;
    }
    setBusy(true);
    const input = {
      service_name: serviceName,
      username,
      url,
      note,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      password,
      secondary,
    };
    try {
      if (isEdit && editAccount) {
        await updateAccount(editAccount.id, input);
        toast.success("계정이 수정되었습니다.");
      } else {
        await createAccount(input);
        toast.success("계정이 추가되었습니다.");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const labelCls = "text-sm font-bold text-slate-700 ml-1 block mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/20 backdrop-blur-sm" {...overlay}>
      <div className="w-full max-w-md rounded-[28px] shadow-2xl bg-white p-6 space-y-3.5 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-extrabold text-slate-900 ml-1">{isEdit ? "계정 수정" : "계정 추가"}</h2>

        <div>
          <label className={labelCls}>서비스명</label>
          <input value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="예: 네이버 검색광고" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>아이디</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="아이디" className={inputCls} autoComplete="off" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>비밀번호</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" className={inputCls} autoComplete="new-password" />
          </div>
          <div>
            <label className={labelCls}>2차 비밀번호(선택)</label>
            <input value={secondary} onChange={(e) => setSecondary(e.target.value)} placeholder="2차 비밀번호" className={inputCls} autoComplete="off" />
          </div>
        </div>
        <div>
          <label className={labelCls}>바로가기 링크(선택)</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="예: searchad.naver.com" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>분류 태그(선택, 쉼표로 구분)</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="예: 광고, 세무" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>메모(선택)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모" className={inputCls} />
        </div>

        {isEdit && (
          <p className="text-xs text-slate-400 ml-1">비밀번호를 바꾸면 이전 비밀번호가 <b>이력</b>에 자동 기록됩니다.</p>
        )}

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
