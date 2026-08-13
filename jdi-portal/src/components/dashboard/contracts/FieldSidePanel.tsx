"use client";

// 편집 화면 왼쪽의 채움 칸 목록.
// 문서에 꽂아 둔 칸을 한눈에 보고, 값(우리가 채우는 칸)을 여기서 채운다.
// 칸을 누르면 문서에서 그 자리로 스크롤되며 깜빡인다.

import { useMemo } from "react";
import { toast } from "sonner";
import { collectFieldKeys } from "@/lib/contracts/tokens";
import type { ContentV2, FieldDef, FieldType } from "@/lib/contracts/types";

const TYPE_LABEL: Record<FieldType, string> = {
  text: "짧은 글",
  multiline: "긴 글",
  number: "숫자",
  date: "날짜",
  phone: "연락처",
  email: "이메일",
  account: "계좌번호",
  bank: "은행",
};

interface Props {
  content: ContentV2;
  onChange: (next: ContentV2) => void;
  /** 계약서(doc) 모드에서는 우리가 채우는 칸 값이 발송 전 필수 */
  docMode: boolean;
  onJumpToField: (key: string) => void;
}

export default function FieldSidePanel({ content, onChange, docMode, onJumpToField }: Props) {
  const usedKeys = useMemo(() => collectFieldKeys(content), [content]);

  const setField = (key: string, patch: Partial<FieldDef>) =>
    onChange({
      ...content,
      fields: content.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)),
    });

  const removeField = (def: FieldDef) => {
    if (usedKeys.has(def.key)) {
      toast.error(`「${def.label}」 칸이 본문에서 쓰이고 있어요. 문서에서 칩을 먼저 지워주세요.`);
      return;
    }
    onChange({ ...content, fields: content.fields.filter((f) => f.key !== def.key) });
  };

  const staffFields = content.fields.filter((f) => f.kind === "staff");
  const partyFields = content.fields.filter((f) => f.kind === "party");
  const emptyStaff = staffFields.filter((f) => !f.value?.trim()).length;

  const renderField = (def: FieldDef) => {
    const unused = !usedKeys.has(def.key);
    return (
      <div
        key={def.key}
        className={`rounded-xl border p-2.5 ${
          def.kind === "staff" ? "border-blue-100 bg-blue-50/40" : "border-amber-100 bg-amber-50/40"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onJumpToField(def.key)}
            className="min-w-0 flex-1 truncate text-left text-[12.5px] font-bold text-slate-700 hover:text-blue-600"
            title="문서에서 이 칸 위치 보기"
          >
            {def.label || def.key}
          </button>
          <span className="shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-400">
            {TYPE_LABEL[def.type]}
          </span>
          <button
            type="button"
            onClick={() => removeField(def)}
            className="shrink-0 text-[11px] font-semibold text-slate-300 hover:text-rose-500"
            title="칸 삭제"
          >
            ✕
          </button>
        </div>

        {def.kind === "staff" ? (
          <input
            value={def.value ?? ""}
            onChange={(e) => setField(def.key, { value: e.target.value })}
            placeholder={docMode ? "발송 전에 꼭 채워주세요" : "기본값 (비워둬도 됨)"}
            className={`mt-1.5 w-full rounded-lg border bg-white px-2.5 py-1.5 text-[12.5px] text-slate-800 focus:outline-none ${
              docMode && !def.value?.trim()
                ? "border-rose-200 focus:border-rose-400"
                : "border-slate-200 focus:border-blue-400"
            }`}
          />
        ) : (
          <p className="mt-1 text-[11px] text-amber-700/80">
            {def.required ? "상대방이 꼭 입력해야 함" : "상대방이 선택 입력"}
          </p>
        )}

        {unused && (
          <p className="mt-1 text-[11px] font-semibold text-slate-400">
            ⚠ 본문에 넣지 않아 계약서에 안 보여요
          </p>
        )}
      </div>
    );
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-slate-400">채움 칸</h3>
        <span className="text-[11px] text-slate-400">
          {content.fields.length === 0 ? "없음" : `${content.fields.length}개`}
        </span>
      </div>

      {content.fields.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-[11.5px] leading-relaxed text-slate-400">
          문서 툴바의 <b className="text-blue-600">＋ 칸 넣기</b> 로 만들어보세요.
          <br />
          금액처럼 계약마다 바뀌는 값은 <b className="text-blue-600">파란 칸</b>,
          주소·계좌처럼 상대방이 적을 값은 <b className="text-amber-600">노란 칸</b>이에요.
        </p>
      ) : (
        <div className="space-y-3">
          {staffFields.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold text-blue-600">
                🔵 우리가 채우는 칸 {docMode && emptyStaff > 0 && `· ${emptyStaff}개 비었음`}
              </p>
              <div className="space-y-1.5">{staffFields.map(renderField)}</div>
            </div>
          )}
          {partyFields.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold text-amber-600">🟡 상대방이 채우는 칸</p>
              <div className="space-y-1.5">{partyFields.map(renderField)}</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
