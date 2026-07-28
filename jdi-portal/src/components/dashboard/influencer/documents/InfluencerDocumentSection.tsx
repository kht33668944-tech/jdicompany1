"use client";

import { useState } from "react";
import { toast } from "sonner";
import Plus from "phosphor-react/dist/icons/Plus.esm.js";
import Lock from "phosphor-react/dist/icons/Lock.esm.js";
import Trash from "phosphor-react/dist/icons/Trash.esm.js";
import { toDateStringFromTimestamp } from "@/lib/utils/date";
import { FILE_ACCEPT_ATTR } from "@/lib/utils/upload";
import {
  DOCUMENT_KIND_LABEL,
  type InfluencerDocumentWithVersions,
} from "@/lib/influencer/contact-types";
import {
  getDocumentDownloadUrl,
  addDocumentVersion,
  deleteInfluencerDocument,
} from "@/lib/influencer/document-actions";
import {
  uploadInfluencerDocumentFile,
  removeInfluencerDocumentFile,
} from "@/lib/influencer/document-storage";
import DocumentUploadModal from "./DocumentUploadModal";
import UnlockPrompt from "./UnlockPrompt";

interface Props {
  influencerId: string;
  documents: InfluencerDocumentWithVersions[];
  onChanged: () => void;
}

/** 버전 목록에서 현재 버전을 고른다. is_current 가 없으면 번호가 가장 큰 것. */
function currentVersion(doc: InfluencerDocumentWithVersions) {
  const versions = doc.versions ?? [];
  return (
    versions.find((v) => v.is_current) ??
    [...versions].sort((a, b) => b.version_no - a.version_no)[0] ??
    null
  );
}

export default function InfluencerDocumentSection({
  influencerId,
  documents,
  onChanged,
}: Props) {
  const [showUpload, setShowUpload] = useState(false);
  const [needUnlock, setNeedUnlock] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 잠금 해제 후 다시 실행할 작업
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  /** 잠금 오류면 비밀번호 창을 띄우고, 해제 후 같은 작업을 다시 시도한다. */
  const runWithUnlock = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (err) {
      const message = err instanceof Error ? err.message : "실패했습니다.";
      if (message.includes("잠금")) {
        setPendingAction(() => () => void runWithUnlock(action));
        setNeedUnlock(true);
      } else {
        toast.error(message);
      }
    }
  };

  const handleView = (versionId: string, docId: string) =>
    runWithUnlock(async () => {
      setBusyId(docId);
      try {
        const url = await getDocumentDownloadUrl(versionId);
        window.open(url, "_blank", "noopener,noreferrer");
      } finally {
        setBusyId(null);
      }
    });

  const handleNewVersion = (doc: InfluencerDocumentWithVersions, file: File) =>
    runWithUnlock(async () => {
      setBusyId(doc.id);
      let uploadedPath: string | null = null;
      try {
        const meta = await uploadInfluencerDocumentFile(influencerId, doc.kind, file);
        uploadedPath = meta.storagePath;
        await addDocumentVersion(doc.id, meta);
        toast.success("새 버전을 올렸습니다.");
        onChanged();
      } catch (err) {
        if (uploadedPath) await removeInfluencerDocumentFile(uploadedPath);
        throw err;
      } finally {
        setBusyId(null);
      }
    });

  const handleDelete = (doc: InfluencerDocumentWithVersions) => {
    if (!window.confirm(`"${doc.title}" 서류를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    void runWithUnlock(async () => {
      setBusyId(doc.id);
      try {
        await deleteInfluencerDocument(doc.id);
        toast.success("서류를 삭제했습니다.");
        onChanged();
      } finally {
        setBusyId(null);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">서류</h4>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
        >
          <Plus size={13} weight="bold" />
          서류 올리기
        </button>
      </div>

      {documents.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">등록된 서류가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const version = currentVersion(doc);
            const versionCount = doc.versions?.length ?? 0;
            const busy = busyId === doc.id;
            return (
              <div
                key={doc.id}
                className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-100"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {doc.is_sensitive && (
                        <Lock size={12} weight="fill" className="text-amber-500 shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-slate-700 truncate">
                        {doc.title}
                      </span>
                      {versionCount > 1 && (
                        <span className="text-[10px] text-slate-400 shrink-0">
                          v{version?.version_no ?? versionCount}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {DOCUMENT_KIND_LABEL[doc.kind]}
                      {version && ` · ${toDateStringFromTimestamp(version.uploaded_at)}`}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={busy}
                    aria-label="서류 삭제"
                    className="shrink-0 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50"
                  >
                    <Trash size={14} />
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {version && (
                    <button
                      onClick={() => void handleView(version.id, doc.id)}
                      disabled={busy}
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                    >
                      {busy ? "여는 중…" : "보기"}
                    </button>
                  )}
                  <label className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                    새 버전
                    <input
                      type="file"
                      accept={FILE_ACCEPT_ATTR}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void handleNewVersion(doc, f);
                      }}
                    />
                  </label>
                  {versionCount > 1 && (
                    <button
                      onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                      className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      이전 버전 {versionCount - 1}개
                    </button>
                  )}
                </div>

                {expandedId === doc.id && (
                  <div className="pt-1.5 border-t border-slate-200/70 space-y-1">
                    {[...(doc.versions ?? [])]
                      .sort((a, b) => b.version_no - a.version_no)
                      .filter((v) => v.id !== version?.id)
                      .map((v) => (
                        <div key={v.id} className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-400 truncate">
                            v{v.version_no} · {toDateStringFromTimestamp(v.uploaded_at)}
                          </span>
                          <button
                            onClick={() => void handleView(v.id, doc.id)}
                            className="text-[11px] text-blue-600 hover:text-blue-700 shrink-0"
                          >
                            보기
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                {doc.note && <p className="text-[11px] text-slate-500">{doc.note}</p>}
              </div>
            );
          })}
        </div>
      )}

      {showUpload && (
        <DocumentUploadModal
          influencerId={influencerId}
          onSaved={() => {
            setShowUpload(false);
            onChanged();
          }}
          onCancel={() => setShowUpload(false)}
          onNeedUnlock={() => setNeedUnlock(true)}
        />
      )}

      {needUnlock && (
        <UnlockPrompt
          onUnlocked={() => {
            setNeedUnlock(false);
            const retry = pendingAction;
            setPendingAction(null);
            retry?.();
          }}
          onCancel={() => {
            setNeedUnlock(false);
            setPendingAction(null);
          }}
        />
      )}
    </div>
  );
}
