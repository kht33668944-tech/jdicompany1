// 계약서 본문(DocContent) HTML 렌더러 — 공개 서명 페이지와 직원 미리보기가 공유한다.
// PDF(pdf.ts)와 같은 순서/구조로 그려서 "보이는 대로 서명·보관"이 되게 한다.

import { TERMS_MARKER } from "@/lib/influencer/contracts/documents/template";
import type { DocContent } from "@/lib/influencer/contracts/documents/types";

function TermsTable({ content }: { content: DocContent }) {
  return (
    <div className="overflow-x-auto my-3">
      <table className="w-full min-w-[480px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-slate-100">
            {["항목", "입력 항목", "합의 내용"].map((h) => (
              <th key={h} className="border border-slate-200 px-2.5 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {content.terms.map((row, i) => {
            // 같은 항목(section)은 첫 행에만 표기 — 원본 계약서의 병합 셀 느낌
            const sectionCell =
              i > 0 && content.terms[i - 1].section === row.section ? "" : row.section;
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

export default function ContractDocView({ content }: { content: DocContent }) {
  return (
    <article className="text-[13.5px] leading-relaxed text-slate-800">
      <h1 className="text-center text-xl font-bold text-slate-900">{content.title}</h1>
      <p className="mt-1 text-center text-sm text-slate-500">{content.subtitle}</p>

      <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 text-[13px]">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {[
            ["갑", content.company.name],
            ["을", content.headerMeta.partyB],
            ["계약 유형", content.headerMeta.contractTypeLabel],
            ["캠페인", content.headerMeta.campaign],
          ].map(([k, v]) => (
            <div key={k} className="flex border-b border-slate-100 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
              <span className="w-20 shrink-0 bg-slate-50 px-3 py-2 font-semibold text-slate-500">{k}</span>
              <span className="px-3 py-2">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-5 whitespace-pre-wrap">{content.intro}</p>

      {content.clauses.map((clause, i) => (
        <section key={i} className="mt-5">
          <h2 className="font-bold text-slate-900">{clause.heading}</h2>
          {clause.body.trim() === TERMS_MARKER ? (
            <TermsTable content={content} />
          ) : (
            <p className="mt-1.5 whitespace-pre-wrap">{clause.body}</p>
          )}
        </section>
      ))}

      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800">
        {content.importantNote}
      </div>
    </article>
  );
}
