"use client";

import { FileArrowDown, X } from "phosphor-react";
import { getAttachmentKind, formatFileSize } from "@/lib/work-timeline/fileKind";

interface AttachmentFileCardProps {
  fileName: string;
  fileSize: number;
  downloadUrl: string | null;
  onDelete?: () => void;
  deleting?: boolean;
}

export default function AttachmentFileCard({
  fileName,
  fileSize,
  downloadUrl,
  onDelete,
  deleting = false,
}: AttachmentFileCardProps) {
  const kind = getAttachmentKind(fileName);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
      <div className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md bg-white ${kind.colorClass}`}>
        <FileArrowDown size={20} weight="fill" aria-hidden="true" />
        <span className="mt-0.5 text-[9px] font-bold leading-none">{kind.label}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-700" title={fileName}>{fileName}</p>
        <p className="text-xs text-slate-400">{formatFileSize(fileSize)}</p>
      </div>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`${fileName} 삭제`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-red-600 disabled:opacity-50"
        >
          <X size={16} weight="bold" aria-hidden="true" />
        </button>
      ) : downloadUrl ? (
        <a
          href={downloadUrl}
          download={fileName}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${fileName} 다운로드`}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          <FileArrowDown size={15} weight="bold" aria-hidden="true" />
          다운로드
        </a>
      ) : null}
    </div>
  );
}
