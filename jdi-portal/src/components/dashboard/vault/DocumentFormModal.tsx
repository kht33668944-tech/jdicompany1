"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Corporation, VaultDocument } from "@/lib/vault/types";
import { DOCUMENT_CATEGORY_SUGGESTIONS } from "@/lib/vault/constants";
import { createDocument, updateDocumentMeta } from "@/lib/vault/actions";
import { uploadVaultFile } from "@/lib/vault/storage";
import { useOverlayDismiss } from "@/components/shared/useOverlayDismiss";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt";

interface Props {
  corporations: Corporation[];
  defaultCorpId: string;
  editDoc: VaultDocument | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function DocumentFormModal({ corporations, defaultCorpId, editDoc, onClose, onSaved }: Props) {
  const isEdit = !!editDoc;
  const [corpId, setCorpId] = useState(editDoc?.corporation_id ?? defaultCorpId);
  const [title, setTitle] = useState(editDoc?.title ?? "");
  const [category, setCategory] = useState(editDoc?.category ?? "");
  const [note, setNote] = useState(editDoc?.note ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const overlay = useOverlayDismiss(onClose);

  const handleSave = async () => {
    if (busy) return;
    if (!title.trim()) {
      toast.error("서류 제목을 입력해주세요.");
      return;
    }
    if (!isEdit) {
      if (!corpId) {
        toast.error("법인을 선택해주세요.");
        return;
      }
      if (!file) {
        toast.error("올릴 파일을 선택해주세요.");
        return;
      }
    }
    setBusy(true);
    try {
      if (isEdit && editDoc) {
        await updateDocumentMeta(editDoc.id, { title, category: category || null, note: note || null });
        toast.success("서류 정보가 수정되었습니다.");
      } else {
        const meta = await uploadVaultFile(corpId, file!);
        await createDocument({ corporationId: corpId, title, category: category || null, note: note || null }, meta);
        toast.success("서류가 등록되었습니다.");
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
      <div className="w-full max-w-md rounded-[28px] shadow-2xl bg-white p-6 space-y-4">
        <h2 className="text-lg font-extrabold text-slate-900 ml-1">{isEdit ? "서류 정보 수정" : "서류 올리기"}</h2>

        {!isEdit && (
          <div>
            <label className={labelCls}>법인</label>
            <select value={corpId} onChange={(e) => setCorpId(e.target.value)} className={inputCls}>
              {corporations.length === 0 && <option value="">먼저 법인을 추가하세요</option>}
              {corporations.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelCls}>제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 사업자등록증" className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>종류(선택)</label>
          <input list="vault-category-suggestions" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="예: 사업자등록증" className={inputCls} />
          <datalist id="vault-category-suggestions">
            {DOCUMENT_CATEGORY_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div>
          <label className={labelCls}>메모(선택)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모" className={inputCls} />
        </div>

        {!isEdit && (
          <div>
            <label className={labelCls}>파일</label>
            <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} className="w-full text-sm text-slate-500 ml-1" />
            <p className="text-xs text-slate-400 ml-1 mt-1">최대 10MB · PDF·이미지·오피스 문서·ZIP</p>
          </div>
        )}
        {isEdit && (
          <p className="text-xs text-slate-400 ml-1">파일을 바꾸려면 목록에서 <b>🔄 최신화</b>를 사용하세요.</p>
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
