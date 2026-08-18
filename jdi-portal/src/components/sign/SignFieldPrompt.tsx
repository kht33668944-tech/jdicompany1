"use client";

// 서명 페이지에서 계약서 안의 노란 칸을 눌렀을 때 뜨는 입력창.
//
// 한 컴포넌트로 두 모양을 낸다 —
//   PC(≥640px)   : 누른 칸 바로 아래에 뜨는 작은 팝오버
//   모바일(<640px): 화면 아래에서 올라오는 시트(키보드가 칸을 가리지 않게)
//
// 화면 폭 판정은 반드시 마운트 후에 한다. 렌더 중에 window 를 읽으면
// 서버 렌더 결과와 어긋나 하이드레이션이 깨진다(ContractSentScreen 과 같은 이유).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { findFieldChip } from "@/lib/contracts/chipFlash";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import type { FieldDef } from "@/lib/contracts/types";

/** 칸 종류별 입력 도우미 — 키보드 종류와 예시를 맞춘다 */
export function inputPropsFor(fieldDef: FieldDef): React.InputHTMLAttributes<HTMLInputElement> {
  switch (fieldDef.type) {
    case "phone":
      return { inputMode: "tel", placeholder: "010-0000-0000" };
    case "email":
      return { inputMode: "email", placeholder: "you@example.com" };
    case "number":
      return { inputMode: "numeric", placeholder: "숫자 입력" };
    case "account":
      return { inputMode: "numeric", placeholder: "예: 302-1234-5678-11" };
    case "bank":
      return { placeholder: "예: 농협은행" };
    case "date":
      return { type: "date" };
    default:
      return {};
  }
}

const POPOVER_WIDTH = 272;
const PROMPT_INPUT_CLS =
  "w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-[15px] text-slate-800 " +
  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

interface Props {
  fieldDef: FieldDef;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  /** 「다음 칸」 — 남은 칸이 없으면 null(그때는 확인 버튼만) */
  onNext: (() => void) | null;
}

export default function SignFieldPrompt({ fieldDef, value, onChange, onClose, onNext }: Props) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  // 다른 칸을 눌렀으면 닫지 않는다 — 그쪽이 스스로 새 입력창을 연다
  const boxRef = useClickOutside<HTMLDivElement>(onClose, {
    capture: true,
    ignoreSelector: "[data-field-key]",
  });
  // 서버 렌더에는 화면 폭이 없다. 판정 전에는 시트 모양으로 두고 마운트 후 정한다.
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // 팝오버 위치 — 칸 아래에 붙이되 화면 밖으로 나가지 않게 민다.
  // 위치는 상태가 아니라 style 에 직접 쓴다(스크롤 한 프레임마다 다시 그리지 않게).
  const place = useCallback(() => {
    const box = boxRef.current;
    const anchor = findFieldChip(document, fieldDef.key);
    if (!box || !anchor) return;
    const r = anchor.getBoundingClientRect();
    box.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 8))}px`;
    box.style.top = `${r.bottom + 8}px`;
  }, [boxRef, fieldDef.key]);

  useLayoutEffect(() => {
    if (!isDesktop) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [isDesktop, place]);

  // 열리면 바로 입력할 수 있게
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [fieldDef.key]);

  // Esc 로 닫기 (바깥 클릭은 위 useClickOutside 가 맡는다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submitKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || fieldDef.type === "multiline") return;
    e.preventDefault();
    if (onNext) onNext();
    else onClose();
  };

  const inner = (
    <>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[12px] font-bold text-slate-700">{fieldDef.label}</span>
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${
            fieldDef.required ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {fieldDef.required ? "꼭 입력" : "선택"}
        </span>
      </div>

      {fieldDef.type === "multiline" ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${PROMPT_INPUT_CLS} min-h-[76px] resize-y`}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={submitKey}
          className={PROMPT_INPUT_CLS}
          {...inputPropsFor(fieldDef)}
        />
      )}

      <div className="mt-2.5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-500 hover:text-slate-700"
        >
          닫기
        </button>
        <button
          type="button"
          onClick={() => (onNext ? onNext() : onClose())}
          className="rounded-lg bg-[#2563eb] px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-700"
        >
          {onNext ? "다음 칸 →" : "확인"}
        </button>
      </div>
    </>
  );

  if (isDesktop) {
    return (
      <div
        ref={boxRef}
        role="dialog"
        aria-label={`${fieldDef.label} 입력`}
        style={{ width: POPOVER_WIDTH }}
        className="fixed z-50 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={`${fieldDef.label} 입력`}
      className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-slate-200 bg-white px-4 pb-5 pt-3 shadow-[0_-6px_24px_rgba(15,23,42,0.14)]"
    >
      <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-slate-200" />
      {inner}
    </div>
  );
}
