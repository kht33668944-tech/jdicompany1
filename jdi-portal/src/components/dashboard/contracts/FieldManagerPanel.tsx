"use client";

// 채움 칸(필드) 관리 패널 — 계약서 편집기의 한 섹션.
// 파랑(직원 채움)·노랑(상대방 입력) 칸을 만들고, 본문에 {{fN}} 으로 삽입해 쓴다.

import { toast } from "sonner";
import { MODAL_INPUT_CLS } from "@/lib/vault/constants";
import { collectFieldKeys, nextFieldKey } from "@/lib/contracts/tokens";
import type { ContentV2, FieldDef, FieldType } from "@/lib/contracts/types";

const TYPE_LABEL: Record<FieldType, string> = {
  text: "짧은 글",
  multiline: "긴 글",
  number: "숫자",
  date: "날짜",
  phone: "연락처",
  email: "이메일",
  account: "계좌번호",
};

interface Props {
  content: ContentV2;
  onChange: (next: ContentV2) => void;
  /** doc 모드에서 staff 값 입력을 강조 표기 */
  docMode: boolean;
}

export default function FieldManagerPanel({ content, onChange, docMode }: Props) {
  const usedKeys = collectFieldKeys(content);

  const setField = (index: number, patch: Partial<FieldDef>) =>
    onChange({
      ...content,
      fields: content.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    });

  const addField = (kind: "staff" | "party") =>
    onChange({
      ...content,
      fields: [
        ...content.fields,
        {
          key: nextFieldKey(content),
          kind,
          label: "",
          type: "text",
          required: true,
          ...(kind === "staff" ? { value: "" } : {}),
        },
      ],
    });

  const removeField = (index: number) => {
    const target = content.fields[index];
    if (usedKeys.has(target.key)) {
      toast.error(
        `「${target.label || target.key}」 칸이 본문에서 사용 중이에요. 본문의 {{${target.key}}} 를 먼저 지워주세요.`,
      );
      return;
    }
    onChange({ ...content, fields: content.fields.filter((_, i) => i !== index) });
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-slate-400">
          채움 칸 — 조항 아래 「칸 삽입」으로 본문 원하는 자리에 넣어요
        </h3>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => addField("staff")}
            className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
          >
            ＋ 우리가 채움
          </button>
          <button
            type="button"
            onClick={() => addField("party")}
            className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[12px] font-bold text-amber-700 hover:bg-amber-100"
          >
            ＋ 상대방 입력
          </button>
        </div>
      </div>

      {content.fields.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-[12.5px] text-slate-400">
          아직 채움 칸이 없어요. 계약금액처럼 계약마다 바뀌는 값은 「우리가 채움」,
          주소·계좌처럼 상대방이 적어야 하는 값은 「상대방 입력」으로 만들어주세요.
        </p>
      ) : (
        <div className="space-y-2">
          {content.fields.map((fieldDef, i) => (
            <div
              key={fieldDef.key}
              className={`rounded-xl border p-3 ${
                fieldDef.kind === "staff"
                  ? "border-blue-100 bg-blue-50/40"
                  : "border-amber-100 bg-amber-50/40"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                    fieldDef.kind === "staff"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {fieldDef.kind === "staff" ? "우리가 채움" : "상대방 입력"}
                </span>
                <input
                  className={`${MODAL_INPUT_CLS} !w-44 flex-1`}
                  value={fieldDef.label}
                  onChange={(e) => setField(i, { label: e.target.value })}
                  placeholder="칸 이름 (예: 계약금액)"
                />
                <select
                  className={`${MODAL_INPUT_CLS} !w-28`}
                  value={fieldDef.type}
                  onChange={(e) => setField(i, { type: e.target.value as FieldType })}
                >
                  {Object.entries(TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {fieldDef.kind === "party" && (
                  <label className="flex items-center gap-1 text-[12px] font-semibold text-slate-500">
                    <input
                      type="checkbox"
                      checked={fieldDef.required}
                      onChange={(e) => setField(i, { required: e.target.checked })}
                      className="h-3.5 w-3.5 accent-amber-500"
                    />
                    필수
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => removeField(i)}
                  className="ml-auto text-[12px] font-semibold text-slate-400 hover:text-rose-500"
                >
                  삭제
                </button>
              </div>
              {fieldDef.kind === "staff" && (
                <div className="mt-2 grid grid-cols-[64px_1fr] items-center gap-2">
                  <span className="text-[12px] font-semibold text-slate-500">
                    {docMode ? "값 *" : "기본값"}
                  </span>
                  <input
                    className={MODAL_INPUT_CLS}
                    value={fieldDef.value ?? ""}
                    onChange={(e) => setField(i, { value: e.target.value })}
                    placeholder={docMode ? "발송 전에 꼭 채워주세요" : "계약서 만들 때 채워요 (비워둬도 됨)"}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
