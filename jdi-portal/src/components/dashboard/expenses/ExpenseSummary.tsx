"use client";

import { useMemo, useState } from "react";
import { formatKrw } from "@/lib/expenses/format";
import type { ExpenseWithMeta } from "@/lib/expenses/types";
import CaretDown from "phosphor-react/dist/icons/CaretDown.esm.js";

interface ExpenseSummaryProps {
  expenses: ExpenseWithMeta[];
  prevMonthTotal: number;
}

export default function ExpenseSummary({ expenses, prevMonthTotal }: ExpenseSummaryProps) {
  const [open, setOpen] = useState(false);

  const { total, methodRows, categoryRows } = useMemo(() => {
    const total = expenses.reduce((s, e) => s + Number(e.amount_krw), 0);
    const byMethod = new Map<string, number>();
    const byCategory = new Map<string, number>();
    for (const e of expenses) {
      byMethod.set(e.payment_method, (byMethod.get(e.payment_method) ?? 0) + Number(e.amount_krw));
      const cat = e.category?.name ?? "미분류";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + Number(e.amount_krw));
    }
    const methodRows = [...byMethod.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const categoryRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    return { total, methodRows, categoryRows };
  }, [expenses]);

  const diff = total - prevMonthTotal;
  const diffLabel = diff === 0 ? "변동 없음" : `${diff > 0 ? "+" : "-"}${formatKrw(Math.abs(diff))}`;
  const diffCls = diff > 0 ? "text-red-500" : "text-emerald-600";

  const breakdownList = (rows: [string, number][]) => (
    <ul className="space-y-1 text-sm">
      {rows.map(([label, sum]) => (
        <li key={label} className="flex justify-between">
          <span className="text-slate-600 truncate mr-2">{label}</span>
          <span className="font-bold text-slate-800 shrink-0">{formatKrw(sum)}</span>
        </li>
      ))}
      {rows.length === 0 && <li className="text-slate-400">지출 없음</li>}
    </ul>
  );

  return (
    <>
      {/* PC: 3열 카드 그리드 (기존 유지) */}
      <div className="hidden md:grid md:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80 shadow-sm p-5">
          <p className="text-xs font-bold text-slate-500">이번 달 총 지출</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{formatKrw(total)}</p>
          <p className={`text-xs font-bold mt-1 ${diffCls}`}>지난달 대비 {diffLabel}</p>
        </div>
        <div className="rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80 shadow-sm p-5">
          <p className="text-xs font-bold text-slate-500 mb-2">결제수단별</p>
          {breakdownList(methodRows)}
        </div>
        <div className="rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80 shadow-sm p-5">
          <p className="text-xs font-bold text-slate-500 mb-2">분류별</p>
          {breakdownList(categoryRows)}
        </div>
      </div>

      {/* 모바일: 총 지출 히어로 + 접히는 내역 */}
      <div className="md:hidden space-y-3">
        <div className="rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80 shadow-sm p-5">
          <p className="text-xs font-bold text-slate-500">이번 달 총 지출</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{formatKrw(total)}</p>
          <p className={`text-sm font-bold mt-1 ${diffCls}`}>지난달 대비 {diffLabel}</p>
        </div>

        <div className="rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5"
            aria-expanded={open}
          >
            <span className="text-sm font-bold text-slate-600">결제수단·분류별 내역</span>
            <CaretDown size={16} weight="bold" className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div className="grid grid-cols-2 gap-4 px-5 pb-4">
              <div>
                <p className="text-xs font-bold text-slate-500 mb-2">결제수단별</p>
                {breakdownList(methodRows)}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 mb-2">분류별</p>
                {breakdownList(categoryRows)}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
