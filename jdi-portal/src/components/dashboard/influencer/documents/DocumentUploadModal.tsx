"use client";

import { useState } from "react";
import { toast } from "sonner";
import Select, { type SelectOption } from "@/components/shared/Select";
import { FILE_ACCEPT_ATTR } from "@/lib/utils/upload";
import {
  DOCUMENT_KIND_LABEL,
  SENSITIVE_KINDS,
  type DocumentKind,
} from "@/lib/influencer/contact-types";
import {
  uploadInfluencerDocumentFile,
  removeInfluencerDocumentFile,
} from "@/lib/influencer/document-storage";
import { createInfluencerDocument } from "@/lib/influencer/document-actions";

interface Props {
  influencerId: string;
  onSaved: () => void;
  onCancel: () => void;
  onNeedUnlock: () => void;
}

const KIND_OPTIONS: SelectOption[] = (
  ["contract", "id_card", "bankbook", "etc"] as DocumentKind[]
).map((k) => ({ value: k, label: DOCUMENT_KIND_LABEL[k] }));

const INPUT_CLS =
  "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

export default function DocumentUploadModal({
  influencerId,
  onSaved,
  onCancel,
  onNeedUnlock,
}: Props) {
  const [kind, setKind] = useState<DocumentKind>("contract");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const isSensitive = SENSITIVE_KINDS.includes(kind);

  const handleSave = async () => {
    if (!file) {
      toast.error("파일을 선택해주세요.");
      return;
    }
    const trimmedTitle = title.trim() || DOCUMENT_KIND_LABEL[kind];

    setSaving(true);
    let uploadedPath: string | null = null;
    try {
      const meta = await uploadInfluencerDocumentFile(influencerId, kind, file);
      uploadedPath = meta.storagePath;
      await createInfluencerDocument(
        { influencerId, kind, title: trimmedTitle, note },
        meta
      );
      toast.success("서류를 올렸습니다.");
      onSaved();
    } catch (err) {
      // 서버 기록이 실패하면 방금 올린 파일을 지워 고아 파일을 남기지 않는다.
      if (uploadedPath) await removeInfluencerDocumentFile(uploadedPath);
      const message = err instanceof Error ? err.message : "서류 저장 실패";
      if (message.includes("잠금")) {
        onNeedUnlock();
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl space-y-3">
        <h3 className="text-sm font-bold text-slate-800">서류 올리기</h3>

        <div>
          <label className="text-[11px] font-semibold text-slate-500 block mb-1">종류</label>
          <Select
            value={kind}
            onChange={(v) => setKind(v as DocumentKind)}
            options={KIND_OPTIONS}
            ariaLabel="서류 종류"
          />
        </div>

        {isSensitive && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
            이 서류는 보호 대상입니다. 올리거나 볼 때 2차 비밀번호가 필요합니다.
          </p>
        )}

        <input
          className={INPUT_CLS}
          placeholder={`제목 (비우면 "${DOCUMENT_KIND_LABEL[kind]}")`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className={INPUT_CLS}
          placeholder="메모 (선택)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <input
          type="file"
          accept={FILE_ACCEPT_ATTR}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
        />

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !file}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "올리는 중…" : "올리기"}
          </button>
        </div>
      </div>
    </div>
  );
}
