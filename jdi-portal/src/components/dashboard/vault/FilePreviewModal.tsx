"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { VaultDocument } from "@/lib/vault/types";
import { getVaultSignedUrl } from "@/lib/vault/storage";
import { triggerDownload } from "@/lib/utils/download";
import { useOverlayDismiss } from "@/components/shared/useOverlayDismiss";

type Kind = "image" | "pdf" | "other";

function fileKind(name: string | null): Kind {
  const ext = name?.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "other";
}

interface Props {
  doc: VaultDocument;
  onClose: () => void;
}

export default function FilePreviewModal({ doc, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const overlay = useOverlayDismiss(onClose);
  const kind = fileKind(doc.file_name);
  const path = doc.current_storage_path;
  const error = !path || fetchError;

  useEffect(() => {
    if (!path) return;
    let alive = true;
    getVaultSignedUrl(path)
      .then((u) => {
        if (alive) setUrl(u);
      })
      .catch(() => {
        if (alive) setFetchError(true);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  const download = () => {
    if (url) triggerDownload(url, doc.file_name ?? undefined);
    else toast.error("파일을 불러오지 못했습니다.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" {...overlay}>
      <div className="w-full max-w-3xl max-h-[90vh] rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
          <div className="min-w-0">
            <div className="font-bold text-slate-800 truncate">{doc.title}</div>
            <div className="text-xs text-slate-400 truncate">{doc.file_name}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={download}
              className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-brand-400 hover:text-brand-600"
            >
              ⤓ 다운로드
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100 grid place-items-center min-h-[320px]">
          {error ? (
            <div className="p-10 text-center text-sm text-slate-500">미리보기를 불러오지 못했습니다. 다운로드해서 확인해주세요.</div>
          ) : !url ? (
            <div className="p-10 text-center text-sm text-slate-400">불러오는 중…</div>
          ) : kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- 서명 URL 원본 미리보기(외부 호스트, 최적화 불필요)
            <img src={url} alt={doc.title} className="max-w-full max-h-[76vh] object-contain" />
          ) : kind === "pdf" ? (
            <iframe src={url} title={doc.title} className="w-full h-[76vh] bg-white" />
          ) : (
            <div className="p-10 text-center text-sm text-slate-500">
              이 형식은 화면 미리보기를 지원하지 않아요.
              <br />
              위 <b>다운로드</b>로 받아서 확인해주세요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
