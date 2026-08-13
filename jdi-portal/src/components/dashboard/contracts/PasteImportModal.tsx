"use client";

// 붙여넣기 → 조항 자동 분리 모달.
// 워드·한글·기존 계약서에서 전체 복사해 붙여넣으면 "제N조" 기준으로 나눠 미리 보여준다.

import { useMemo, useState } from "react";
import ModalContainer from "@/components/shared/ModalContainer";
import { parseContractText, type ParsedPaste } from "@/lib/contracts/parse";

interface Props {
  onApply: (parsed: ParsedPaste) => void;
  onClose: () => void;
}

export default function PasteImportModal({ onApply, onClose }: Props) {
  const [raw, setRaw] = useState("");
  const parsed = useMemo(() => parseContractText(raw), [raw]);
  const hasHeadings = parsed.clauses.some((c) => c.heading);

  return (
    <ModalContainer onClose={onClose} maxWidth="max-w-2xl">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-extrabold text-slate-800">계약서 붙여넣기</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          워드·한글에서 계약서 전체를 복사해 붙여넣으면 &quot;제N조&quot; 기준으로 조항을 자동으로 나눠드려요.
        </p>
      </div>

      <div className="max-h-[60vh] space-y-3 overflow-y-auto px-6 py-4">
        <textarea
          className="min-h-[220px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[13.5px] leading-relaxed text-slate-800 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={"여기에 붙여넣으세요.\n\n예)\n용역 계약서\n제1조 (목적) …\n제2조 (계약 기간) …"}
        />

        {raw.trim() && (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            {hasHeadings ? (
              <>
                <p className="text-[13px] font-bold text-slate-700">
                  조항 {parsed.clauses.length}개를 찾았어요
                  {parsed.intro && " · 제1조 앞 내용은 서문으로 들어가요"}
                </p>
                <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-[12.5px] text-slate-500">
                  {parsed.clauses.map((c, i) => (
                    <li key={i} className="truncate">
                      {c.heading || "(제목 없음)"}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[13px] text-slate-500">
                &quot;제N조&quot; 형식의 제목을 찾지 못했어요. 적용하면 전체가 조항 1개로 들어가고,
                편집 화면에서 직접 나눌 수 있어요.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          닫기
        </button>
        <button
          type="button"
          disabled={parsed.clauses.length === 0}
          onClick={() => {
            onApply(parsed);
            onClose();
          }}
          className="rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40"
        >
          이 내용으로 채우기
        </button>
      </div>
    </ModalContainer>
  );
}
