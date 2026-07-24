"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Corporation, VaultDocument } from "@/lib/vault/types";
import { DOCUMENT_CATEGORY_SUGGESTIONS, MODAL_INPUT_CLS, MODAL_LABEL_CLS } from "@/lib/vault/constants";
import { createDocument, updateDocumentMeta } from "@/lib/vault/actions";
import { uploadVaultFile, removeVaultFile } from "@/lib/vault/storage";
import { useOverlayDismiss } from "@/components/shared/useOverlayDismiss";
import Select from "@/components/shared/Select";
import FileDropZone from "./FileDropZone";

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
        try {
          await createDocument({ corporationId: corpId, title, category: category || null, note: note || null }, meta);
        } catch (e) {
          await removeVaultFile(meta.storagePath); // 서버 기록 실패 시 방금 올린 파일 정리(고아 방지)
          throw e;
        }
        toast.success("서류가 등록되었습니다.");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/20 backdrop-blur-sm" {...overlay}>
      <div className="w-full max-w-md rounded-[28px] shadow-2xl bg-white p-6 space-y-4">
        <h2 className="text-lg font-extrabold text-slate-900 ml-1">{isEdit ? "서류 정보 수정" : "서류 올리기"}</h2>

        {!isEdit && (
          <div>
            <label className={MODAL_LABEL_CLS}>법인</label>
            <Select
              options={corporations.map((c) => ({ value: c.id, label: c.name }))}
              value={corpId}
              onChange={setCorpId}
              placeholder={corporations.length === 0 ? "먼저 법인을 추가하세요" : "법인 선택"}
              ariaLabel="법인"
              className={MODAL_INPUT_CLS}
            />
          </div>
        )}

        <div>
          <label className={MODAL_LABEL_CLS}>제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 사업자등록증" className={MODAL_INPUT_CLS} />
        </div>

        <div>
          <label className={MODAL_LABEL_CLS}>종류(선택)</label>
          <input list="vault-category-suggestions" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="예: 사업자등록증" className={MODAL_INPUT_CLS} />
          <datalist id="vault-category-suggestions">
            {DOCUMENT_CATEGORY_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div>
          <label className={MODAL_LABEL_CLS}>메모(선택)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모" className={MODAL_INPUT_CLS} />
        </div>

        {!isEdit && (
          <div>
            <label className={MODAL_LABEL_CLS}>파일</label>
            <FileDropZone file={file} onFile={setFile} disabled={busy} />
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
