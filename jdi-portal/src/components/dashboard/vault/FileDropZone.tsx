"use client";

import { useEffect, useRef, useState } from "react";
import { FILE_ACCEPT_ATTR } from "@/lib/utils/upload";

interface Props {
  file: File | null;
  onFile: (f: File | null) => void;
  disabled?: boolean;
}

/**
 * 파일 업로드 박스: 끌어다 놓기(드래그앤드롭) + 클릭 선택 + Ctrl+V 붙여넣기 지원.
 * onFile 은 상태 setter(안정적 참조)를 넘겨받는다.
 */
export default function FileDropZone({ file, onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  // 모달이 열려 있는 동안 어디서든 Ctrl+V 로 파일 붙여넣기 (스크린샷 이미지/복사한 파일)
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const f = e.clipboardData?.files?.[0];
      if (f) {
        e.preventDefault();
        onFile(f);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [disabled, onFile]);

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="파일 선택 (끌어다 놓기 또는 Ctrl+V 붙여넣기)"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !disabled) onFile(f);
        }}
        className={[
          "w-full rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          drag
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50",
        ].join(" ")}
      >
        {file ? (
          <div className="flex items-center justify-center gap-2 text-sm">
            <span className="text-xl">📄</span>
            <span className="font-semibold text-slate-800 truncate max-w-[240px]">{file.name}</span>
            <span className="text-emerald-600 font-bold">✓</span>
          </div>
        ) : (
          <div className="text-slate-500">
            <div className="text-2xl mb-1">📎</div>
            <b className="text-slate-700 text-sm">파일을 여기로 끌어다 놓거나 클릭</b>
            <div className="text-xs text-slate-400 mt-1">Ctrl+V 붙여넣기도 돼요 · 최대 10MB (PDF·엑셀·이미지·워드·PPT·ZIP)</div>
          </div>
        )}
      </div>

      {file && (
        <button
          type="button"
          onClick={() => onFile(null)}
          disabled={disabled}
          className="mt-1.5 ml-1 text-xs text-slate-400 hover:text-red-500 disabled:opacity-50"
        >
          파일 지우기
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={FILE_ACCEPT_ATTR}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = ""; // 같은 파일 다시 선택 가능하도록 초기화
        }}
      />
    </div>
  );
}
