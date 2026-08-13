"use client";

// 파일 미리보기 모달 — 서류 보관함과 계약서 보관함이 공유한다.
// 호출부가 fetchUrl(서명 URL 발급 함수)을 넘기므로 저장 위치(버킷)에 얽매이지 않는다.

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
  title: string;
  fileName: string | null;
  /** 서명 URL 발급 — null 이면 미리보기 실패 처리 */
  fetchUrl: () => Promise<string | null>;
  onClose: () => void;
}

export default function FilePreviewModal({ title, fileName, fetchUrl, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const overlay = useOverlayDismiss(onClose);
  const kind = fileKind(fileName);
  const error = fetchError;

  useEffect(() => {
    let alive = true;
    fetchUrl()
      .then((u) => {
        if (!alive) return;
        if (u) setUrl(u);
        else setFetchError(true);
      })
      .catch(() => {
        if (alive) setFetchError(true);
      });
    return () => {
      alive = false;
    };
    // fetchUrl 은 렌더마다 새 함수라 의존성에 넣으면 무한 재발급된다 — 마운트 시 1회만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = () => {
    if (url) triggerDownload(url, fileName ?? undefined);
    else toast.error("파일을 불러오지 못했습니다.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" {...overlay}>
      <div className="w-full max-w-3xl max-h-[90vh] rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
          <div className="min-w-0">
            <div className="font-bold text-slate-800 truncate">{title}</div>
            <div className="text-xs text-slate-400 truncate">{fileName}</div>
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
            <img src={url} alt={title} className="max-w-full max-h-[76vh] object-contain" />
          ) : kind === "pdf" ? (
            <iframe src={url} title={title} className="w-full h-[76vh] bg-white" />
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
