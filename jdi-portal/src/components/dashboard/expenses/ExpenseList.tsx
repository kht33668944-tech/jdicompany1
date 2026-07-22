"use client";

import { useMemo, useState } from "react";
import { formatDate } from "@/lib/utils/date";
import { formatKrw, formatForeign } from "@/lib/expenses/format";
import { EXPENSE_SOURCE_LABEL, CATEGORY_STYLE, CATEGORY_STYLE_FALLBACK } from "@/lib/expenses/constants";
import type { ExpenseCategory, ExpenseWithMeta } from "@/lib/expenses/types";
import Select, { type SelectOption } from "@/components/shared/Select";
import Paperclip from "phosphor-react/dist/icons/Paperclip.esm.js";
import ArrowsClockwise from "phosphor-react/dist/icons/ArrowsClockwise.esm.js";

const FILTER_CLS = "w-full md:w-auto bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm";

interface ExpenseListProps {
  expenses: ExpenseWithMeta[];
  categories: ExpenseCategory[];
  onChanged: () => void;
  loading?: boolean;
  onSelect?: (expense: ExpenseWithMeta) => void;
}

export default function ExpenseList({ expenses, categories, loading, onSelect }: ExpenseListProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");

  const methods = useMemo(
    () => [...new Set(expenses.map((e) => e.payment_method))].sort(),
    [expenses]
  );

  const categoryOptions: SelectOption[] = useMemo(
    () => [
      { value: "", label: "전체 분류" },
      ...categories.map((c) => ({ value: c.id, label: c.name, dotClass: CATEGORY_STYLE[c.name]?.dot })),
    ],
    [categories]
  );
  const methodOptions: SelectOption[] = useMemo(
    () => [{ value: "", label: "전체 결제수단" }, ...methods.map((m) => ({ value: m, label: m }))],
    [methods]
  );

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (categoryFilter && e.category_id !== categoryFilter) return false;
      if (methodFilter && e.payment_method !== methodFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !e.description.toLowerCase().includes(q) &&
          !(e.vendor ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [expenses, search, categoryFilter, methodFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, ExpenseWithMeta[]>();
    for (const e of filtered) {
      const list = map.get(e.expense_date) ?? [];
      list.push(e);
      map.set(e.expense_date, list);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="내용·거래처 검색"
          className="w-full md:flex-1 md:min-w-[160px] bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="grid grid-cols-2 gap-2 md:contents">
          <Select
            options={categoryOptions}
            value={categoryFilter}
            onChange={setCategoryFilter}
            ariaLabel="분류 필터"
            className={FILTER_CLS}
          />
          <Select
            options={methodOptions}
            value={methodFilter}
            onChange={setMethodFilter}
            ariaLabel="결제수단 필터"
            className={FILTER_CLS}
          />
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">불러오는 중…</p>}
      {!loading && grouped.length === 0 && (
        <div className="rounded-2xl bg-white/65 border border-white/80 shadow-sm p-10 text-center text-sm text-slate-400">
          이 달에 기록된 지출이 없습니다.
        </div>
      )}

      {grouped.map(([date, rows]) => (
        <div key={date}>
          <p className="text-xs font-bold text-slate-500 mb-2 ml-1">{formatDate(date)}</p>
          <div className="space-y-2">
            {rows.map((e) => {
              const style = CATEGORY_STYLE[e.category?.name ?? ""] ?? CATEGORY_STYLE_FALLBACK;
              const isRecurring = e.source === "recurring";
              return (
              <button
                key={e.id}
                onClick={() => onSelect?.(e)}
                className={`w-full text-left rounded-2xl backdrop-blur-sm border shadow-sm hover:shadow-md px-5 py-3.5 hover:bg-white transition-all flex items-center gap-3 ${style.card}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {e.vendor ? `${e.vendor} · ` : ""}{e.description}
                    </p>
                    {isRecurring && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold px-2 py-0.5 shrink-0">
                        <ArrowsClockwise size={11} weight="bold" />
                        고정
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate flex items-center gap-1">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                    {e.category?.name ?? "미분류"} · {e.payment_method}
                    {!isRecurring ? ` · ${EXPENSE_SOURCE_LABEL[e.source]}` : ""}
                    {e.author_profile ? ` · ${e.author_profile.full_name}` : ""}
                  </p>
                </div>
                {e.receipt_path && <Paperclip size={16} className="text-slate-400 shrink-0" />}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-800">{formatKrw(Number(e.amount_krw))}</p>
                  {e.currency === "USD" && e.amount_foreign != null && (
                    <p className="text-xs text-slate-400">{formatForeign(Number(e.amount_foreign), "USD")}</p>
                  )}
                </div>
              </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
