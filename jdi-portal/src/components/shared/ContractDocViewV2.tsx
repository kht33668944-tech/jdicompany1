// 계약관리(범용) 본문(ContentV2) HTML 렌더러 — 공개 서명 페이지·직원 편집기 미리보기가 공유한다.
// PDF(lib/contracts/pdf.ts)와 같은 순서/구조로 그려서 "보이는 대로 서명·보관"이 되게 한다.
//
// 모드
//  - edit    : 채움 칸을 색 칩으로 표시(파랑=직원 채움, 노랑=상대방 입력) — 편집기 미리보기
//  - sign    : 직원 채움 값은 본문에 인쇄, 상대방 칸은 노란 칸(입력하면 값 표시) — 서명 페이지
//  - resolved: 모든 값 치환 — 완성본 미리보기

import { TERMS_MARKER } from "@/lib/contracts/constants";
import { tokenizeBody } from "@/lib/contracts/tokens";
import type { ContentV2, FieldDef, TermRow } from "@/lib/contracts/types";

export type DocViewMode = "edit" | "sign" | "resolved";

interface Props {
  content: ContentV2;
  mode: DocViewMode;
  /** 을 표시명 (머리표) */
  partyB: string;
  /** 상대방 입력값(필드 key → 값) — sign/resolved 모드에서 사용 */
  partyValues?: Record<string, string>;
  /**
   * sign 모드에서 노란 칸을 눌렀을 때 — 서명 페이지가 그 자리에 입력창을 연다.
   * 넘기지 않으면 지금까지처럼 그냥 보여주기만 한다(편집기 미리보기·완성본은 그대로).
   */
  onFieldClick?: (key: string) => void;
  /** 지금 입력 중인 칸(테두리 강조) */
  activeFieldKey?: string | null;
}

const CHIP_BASE =
  "mx-0.5 inline-block rounded-md border border-dashed px-1.5 py-0 text-[12px] font-bold align-baseline";

function FieldRun({
  fieldDef,
  token,
  mode,
  partyValue,
  onFieldClick,
  activeFieldKey,
}: {
  fieldDef: FieldDef | undefined;
  token: string;
  mode: DocViewMode;
  partyValue: string | undefined;
  onFieldClick?: (key: string) => void;
  activeFieldKey?: string | null;
}) {
  // 정의가 없는 토큰은 리터럴 그대로 (검증이 막지만 방어적으로)
  if (!fieldDef) return <>{token}</>;

  const staffValue = fieldDef.kind === "staff" ? fieldDef.value?.trim() : undefined;

  if (mode === "edit") {
    return (
      <span
        className={`${CHIP_BASE} ${
          fieldDef.kind === "staff"
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : "border-amber-300 bg-amber-50 text-amber-700"
        }`}
      >
        {fieldDef.kind === "staff" ? (staffValue || fieldDef.label) : fieldDef.label}
      </span>
    );
  }

  if (fieldDef.kind === "staff") {
    return <strong className="font-bold">{staffValue || "＿＿＿"}</strong>;
  }

  const value = partyValue?.trim();
  if (mode === "resolved" && value) return <strong className="font-bold">{value}</strong>;

  const label = value || `${fieldDef.label} 입력`;

  // 서명 페이지 — 칸을 눌러 그 자리에서 입력한다.
  // 채운 칸은 값이 본문 글자처럼 보이되(테두리만 옅게) 다시 눌러 고칠 수 있다.
  if (mode === "sign" && onFieldClick) {
    const tone =
      activeFieldKey === fieldDef.key
        ? "border-solid border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200"
        : value
          ? "border-solid border-slate-200 bg-white font-bold text-slate-800 hover:border-blue-300"
          : `border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 ${
              fieldDef.required ? "border-2" : ""
            }`;
    return (
      <button
        type="button"
        data-field-key={fieldDef.key}
        onClick={() => onFieldClick(fieldDef.key)}
        aria-label={`${fieldDef.label} ${value ? "고치기" : "입력하기"}`}
        className={`${CHIP_BASE} cursor-pointer transition-colors ${tone}`}
      >
        {label}
      </button>
    );
  }

  return (
    <span className={`${CHIP_BASE} border-amber-300 bg-amber-50 text-amber-700`}>{label}</span>
  );
}

function Paragraphs({
  body,
  fieldMap,
  mode,
  partyValues,
  className,
  onFieldClick,
  activeFieldKey,
}: {
  body: string;
  fieldMap: Map<string, FieldDef>;
  mode: DocViewMode;
  partyValues: Record<string, string>;
  className?: string;
  onFieldClick?: (key: string) => void;
  activeFieldKey?: string | null;
}) {
  return (
    <>
      {tokenizeBody(body).map((runs, i) => (
        <p key={i} className={className ?? "mt-1.5"}>
          {runs.map((run, j) =>
            run.type === "text" ? (
              run.bold ? (
                <strong key={j} className="font-bold">
                  {run.text}
                </strong>
              ) : (
                <span key={j}>{run.text}</span>
              )
            ) : (
              <FieldRun
                key={j}
                fieldDef={fieldMap.get(run.key)}
                token={`{{${run.key}}}`}
                mode={mode}
                partyValue={partyValues[run.key]}
                onFieldClick={onFieldClick}
                activeFieldKey={activeFieldKey}
              />
            ),
          )}
        </p>
      ))}
    </>
  );
}

function TermsTable({ terms }: { terms: TermRow[] }) {
  return (
    <div className="overflow-x-auto my-3">
      <table className="w-full min-w-[480px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-slate-100">
            {["항목", "입력 항목", "합의 내용"].map((h) => (
              <th
                key={h}
                className="border border-slate-200 px-2.5 py-2 text-left font-semibold text-slate-600 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {terms.map((row, i) => {
            // 같은 항목(section)은 첫 행에만 표기 — 원본 계약서의 병합 셀 느낌
            const sectionCell = i > 0 && terms[i - 1].section === row.section ? "" : row.section;
            return (
              <tr key={i}>
                <td className="border border-slate-200 px-2.5 py-2 font-semibold text-slate-600 whitespace-nowrap">
                  {sectionCell}
                </td>
                <td className="border border-slate-200 px-2.5 py-2 text-slate-500 whitespace-nowrap">
                  {row.label}
                </td>
                <td className="border border-slate-200 px-2.5 py-2 text-slate-800">
                  {row.value.trim() || <span className="text-slate-300">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ContractDocViewV2({
  content,
  mode,
  partyB,
  partyValues = {},
  onFieldClick,
  activeFieldKey,
}: Props) {
  const fieldMap = new Map(content.fields.map((f) => [f.key, f]));
  const runProps = { onFieldClick, activeFieldKey };

  return (
    <article className="text-[13.5px] leading-relaxed text-slate-800">
      <h1 className="text-center text-xl font-bold text-slate-900">
        {content.title.trim() || "계약서"}
      </h1>

      <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 text-[13px]">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {[
            ["갑", content.company.name],
            ["을", partyB],
          ].map(([k, v]) => (
            <div key={k} className="flex border-b border-slate-100 last:border-b-0 sm:border-b-0">
              <span className="w-20 shrink-0 bg-slate-50 px-3 py-2 font-semibold text-slate-500">
                {k}
              </span>
              <span className="px-3 py-2">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {content.intro.trim() && (
        <div className="mt-5">
          <Paragraphs
            body={content.intro}
            fieldMap={fieldMap}
            mode={mode}
            partyValues={partyValues}
            className="mt-1 whitespace-pre-wrap"
            {...runProps}
          />
        </div>
      )}

      {content.clauses.map((clause, i) => (
        <section key={i} className="mt-5">
          {clause.heading.trim() && <h2 className="font-bold text-slate-900">{clause.heading}</h2>}
          {clause.body.trim() === TERMS_MARKER ? (
            <TermsTable terms={content.terms ?? []} />
          ) : (
            <Paragraphs
              body={clause.body}
              fieldMap={fieldMap}
              mode={mode}
              partyValues={partyValues}
              {...runProps}
            />
          )}
        </section>
      ))}

      {content.closing.trim() && (
        <p className="mt-6 text-center text-[12.5px] text-slate-500">{content.closing}</p>
      )}
      {content.footnote.trim() && (
        <p className="mt-2 text-center text-[11.5px] text-slate-400">{content.footnote}</p>
      )}
    </article>
  );
}
