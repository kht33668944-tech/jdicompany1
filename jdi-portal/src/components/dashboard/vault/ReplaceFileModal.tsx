"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { VaultDocument } from "@/lib/vault/types";
import { replaceDocument } from "@/lib/vault/actions";
import { uploadVaultFile, removeVaultFile } from "@/lib/vault/storage";
import { FILE_ACCEPT_ATTR } from "@/lib/utils/upload";
import { useOverlayDismiss } from "@/components/shared/useOverlayDismiss";

interface Props {
  doc: VaultDocument;
  onClose: () => void;
  onSaved: () => void;
}

export default function ReplaceFileModal({ doc, onClose, onSaved }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const overlay = useOverlayDismiss(onClose);

  const handleSave = async () => {
    if (busy) return;
    if (!file) {
      toast.error("새 파일을 선택해주세요.");
      return;
    }
    setBusy(true);
    try {
      const meta = await uploadVaultFile(doc.corporation_id, file);
      try {
        await replaceDocument(doc.id, meta);
      } catch (e) {
        await removeVaultFile(meta.storagePath); // 최신화 기록 실패 시 방금 올린 파일 정리(고아 방지)
        throw e;
      }
      toast.success("최신 파일로 교체했습니다. 이전 파일은 ‘지난 버전’에 보관됩니다.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "최신화에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/20 backdrop-blur-sm" {...overlay}>
      <div className="w-full max-w-md rounded-[28px] shadow-2xl bg-white p-6 space-y-4">
        <h2 className="text-lg font-extrabold text-slate-900 ml-1">서류 최신화</h2>
        <p className="text-sm text-slate-500 ml-1">
          <b className="text-slate-700">{doc.title}</b> 을(를) 새 파일로 교체합니다.<br />
          이전 파일(현재 v{doc.current_version_no ?? 1})은 <b>지난 버전</b>으로 보관되어 되돌릴 수 있어요.
        </p>
        <div>
          <input type="file" accept={FILE_ACCEPT_ATTR} onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} className="w-full text-sm text-slate-500 ml-1" />
          <p className="text-xs text-slate-400 ml-1 mt-1">최대 10MB · PDF·이미지·오피스 문서·ZIP</p>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="px-6 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-100 disabled:opacity-50">취소</button>
          <button type="button" onClick={handleSave} disabled={busy} className="px-6 py-2.5 rounded-xl bg-[#2563eb] text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50">
            {busy ? "교체 중…" : "최신화"}
          </button>
        </div>
      </div>
    </div>
  );
}
