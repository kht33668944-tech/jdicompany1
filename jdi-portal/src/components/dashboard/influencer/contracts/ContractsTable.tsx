"use client";

// TMA 계약 목록 테이블 — 조용하고 밀도 있는 업무용 표 (InfluencerTable 패턴)
// 핵심 컬럼 11개만 노출하고 나머지 필드는 상세 패널에서 보여준다.

import LinkSimple from "phosphor-react/dist/icons/LinkSimple.esm.js";
import NotePencil from "phosphor-react/dist/icons/NotePencil.esm.js";
import ContractStatusDropdown from "./ContractStatusDropdown";
import {
  COLLAB_TYPE_LABEL,
  CONTRACT_STATUS_ORDER,
  PRODUCT_LABEL,
  SECONDARY_USAGE_LABEL,
} from "@/lib/influencer/contracts/labels";
import {
  getDateUrgency,
  getRetentionEnd,
  type DateUrgency,
} from "@/lib/influencer/contracts/dates";
import { URGENT_SOON_DAYS } from "@/lib/influencer/contracts/constants";
import type { ContractStatus, InfluencerContract } from "@/lib/influencer/contracts/types";
import { formatKrw } from "@/lib/expenses/format";
import { formatDateShort } from "@/lib/utils/date";

interface Props {
  contracts: InfluencerContract[];
  totalCount: number;
  settlementIds: Set<string>;
  today: string;
  hasSearch: boolean;
  hasActiveFilter: boolean;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: ContractStatus) => void;
}

const statusIndex = (s: ContractStatus) => CONTRACT_STATUS_ORDER.indexOf(s);

/** 취소/정산 완료 행은 날짜 강조를 전부 끈다(조용한 테이블 원칙) */
function isQuiet(c: InfluencerContract): boolean {
  return c.contract_status === "canceled" || c.contract_status === "settled";
}

/** 해당 단계를 이미 지난 계약이면 그 날짜는 강조하지 않는다 */
function urgencyFor(
  c: InfluencerContract,
  dateStr: string | null,
  today: string,
  suppressAfter: ContractStatus,
): DateUrgency {
  if (isQuiet(c)) return null;
  if (statusIndex(c.contract_status) >= statusIndex(suppressAfter)) return null;
  return getDateUrgency(dateStr, today, URGENT_SOON_DAYS);
}

function DateCell({ dateStr, urgency }: { dateStr: string | null; urgency: DateUrgency }) {
  if (!dateStr) return <span className="text-slate-300">—</span>;
  const label = formatDateShort(dateStr);
  if (urgency === "soon") {
    return (
      <span className="inline-flex flex-col items-start">
        <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-700 font-semibold">{label}</span>
        <span className="text-[10px] font-bold text-amber-600">임박</span>
      </span>
    );
  }
  if (urgency === "overdue") {
    return (
      <span className="inline-flex flex-col items-start">
        <span className="text-red-600 font-semibold">{label}</span>
        <span className="text-[10px] font-bold text-red-500">지남</span>
      </span>
    );
  }
  return <span>{label}</span>;
}

export default function ContractsTable({
  contracts,
  totalCount,
  settlementIds,
  today,
  hasSearch,
  hasActiveFilter,
  onSelect,
  onStatusChange,
}: Props) {
  const emptyMessage =
    totalCount === 0
      ? "아직 등록된 계약이 없어요. ‘새 계약 추가’를 눌러 시작하세요."
      : hasSearch
        ? "검색 결과가 없어요."
        : hasActiveFilter
          ? "필터에 맞는 계약이 없어요."
          : "표시할 계약이 없어요.";

  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)] min-h-[320px] border-t border-slate-100">
      {contracts.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">{emptyMessage}</div>
      ) : (
        <table className="w-full min-w-[1150px] border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm">
            <tr>
              {[
                "이름 / 채널",
                "협업 유형",
                "제품",
                "금액",
                "계약 상태",
                "제품 발송일",
                "게시 예정일",
                "실제 게시일",
                "2차 활용",
                "정산정보",
                "링크·메모",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap border-b border-slate-100"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {contracts.map((c) => {
              const quiet = isQuiet(c);
              const retentionEnd = getRetentionEnd(c.post_actual_date);
              const money =
                c.collab_type === "paid"
                  ? { value: c.ad_fee_total, sub: c.ad_fee_vat_included ? "광고비 · 부가세 포함" : "광고비 · 부가세 별도" }
                  : { value: c.agreed_value, sub: "약정가액" };
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`cursor-pointer transition-colors hover:bg-slate-50/60 ${quiet ? "opacity-55" : ""}`}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-bold text-slate-800">{c.name}</div>
                    {c.instagram_handle && (
                      <div className="text-[11px] text-slate-400">@{c.instagram_handle}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                      {COLLAB_TYPE_LABEL[c.collab_type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                    {PRODUCT_LABEL[c.product]}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-slate-700 tabular-nums">
                    {money.value === null ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <>
                        <div className="font-semibold">{formatKrw(money.value)}</div>
                        <div className="text-[10px] text-slate-400">{money.sub}</div>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <ContractStatusDropdown
                      status={c.contract_status}
                      onChange={(next) => onStatusChange(c.id, next)}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                    <DateCell
                      dateStr={c.product_ship_date}
                      urgency={urgencyFor(c, c.product_ship_date, today, "product_shipped")}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                    <DateCell
                      dateStr={c.post_planned_date}
                      urgency={c.post_actual_date ? null : urgencyFor(c, c.post_planned_date, today, "posted")}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                    {c.post_actual_date ? (
                      <>
                        <div>{formatDateShort(c.post_actual_date)}</div>
                        {retentionEnd && (
                          <div className="text-[10px] text-slate-400">유지 ~ {formatDateShort(retentionEnd)}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                      {SECONDARY_USAGE_LABEL[c.secondary_usage]}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {settlementIds.has(c.id) ? (
                      <span className="inline-block rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                        ✓ 등록됨
                      </span>
                    ) : (
                      <span className="inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-400">
                        미등록
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      {c.modusign_url && (
                        <a
                          href={c.modusign_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-600 hover:text-blue-700"
                          title="모두싸인 문서 열기"
                          aria-label="모두싸인 문서 열기"
                        >
                          <LinkSimple size={15} />
                        </a>
                      )}
                      {c.memo && <NotePencil size={15} aria-label="메모 있음" />}
                      {!c.modusign_url && !c.memo && <span className="text-slate-300">—</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
