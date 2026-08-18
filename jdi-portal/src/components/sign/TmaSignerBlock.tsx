"use client";

// TMA 계약서의 「서명 및 계약 정보」 표 — 계약서 맨 끝에 인쇄되는 그 표를 화면에도 그린다.
//
// 빈칸을 누르면 그 자리에서 입력창(SignFieldPrompt)이 열리고, 채우면 값이 그 자리에 박힌다.
// 아래에 폼을 따로 두지 않는 이유: 조항이 열 개 넘는 계약서에서 폼만 보면
// 그 값이 계약서 어디에 들어가는지 알 수 없다.
//
// 여기는 "인쇄되는 값"만 담는다. 신분증 사진·서명 캔버스·동의 체크는 인쇄 대상이 아니라
// 이 표 밖(SignPageClient)에 둔다.

import { fieldChipTone } from "@/lib/contracts/chipTone";
import type { FieldDef } from "@/lib/contracts/types";

interface Props {
  fields: FieldDef[];
  values: Record<string, string>;
  /** 지금 입력 중인 칸 */
  activeKey: string | null;
  onFieldClick: (key: string) => void;
}

export default function TmaSignerBlock({ fields, values, activeKey, onFieldClick }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[12.5px] font-bold text-slate-700">
        서명 및 계약 정보
      </h3>

      {fields.map((f) => {
        const value = values[f.key]?.trim() ?? "";
        return (
          <div
            key={f.key}
            className="flex items-center gap-3 border-b border-dashed border-slate-100 px-4 py-2.5 last:border-b-0"
          >
            <span className="w-[92px] shrink-0 text-[12.5px] font-semibold text-slate-500">
              {f.label}
              {f.required && <span className="ml-0.5 text-amber-500">*</span>}
            </span>

            <button
              type="button"
              data-field-key={f.key}
              onClick={() => onFieldClick(f.key)}
              aria-label={`${f.label} ${value ? "고치기" : "입력하기"}`}
              className={`min-w-0 flex-1 truncate rounded-lg border border-dashed px-3 py-1.5 text-left text-[13px] font-bold transition-colors ${fieldChipTone(
                { active: activeKey === f.key, filled: Boolean(value), required: f.required },
              )}`}
            >
              {value || "여기를 눌러 입력"}
            </button>

            {value && <span className="shrink-0 text-[13px] font-bold text-emerald-600">✓</span>}
          </div>
        );
      })}
    </div>
  );
}
