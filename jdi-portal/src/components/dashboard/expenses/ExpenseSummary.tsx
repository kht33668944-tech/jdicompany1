"use client";

import { useMemo } from "react";
import { formatKrw } from "@/lib/expenses/format";
import type { ExpenseWithMeta } from "@/lib/expenses/types";

interface ExpenseSummaryProps {
  expenses: ExpenseWithMeta[];
  prevMonthTotal: number;
}

export default function ExpenseSummary({ expenses, prevMonthTotal }: ExpenseSummaryProps) {
  const { total, byMethod, byCategory } = useMemo(() => {
    const total = expenses.reduce((s, e) => s + Number(e.amount_krw), 0);
    const byMethod = new Map<string, number>();
    const byCategory = new Map<string, number>();
    for (const e of expenses) {
      byMethod.set(e.payment_method, (byMethod.get(e.payment_method) ?? 0) + Number(e.amount_krw));
      const cat = e.category?.name ?? "미분류";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + Number(e.amount_krw));
    }
    return { total, byMethod, byCategory };
  }, [expenses]);

  const diff = total - prevMonthTotal;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80 p-5">
        <p className="text-xs font-bold text-slate-500">이번 달 총 지출</p>
        <p className="text-2xl font-bold text-slate-800 mt-1">{formatKrw(total)}</p>
        <p className={`text-xs font-bold mt-1 ${diff > 0 ? "text-red-500" : "text-emerald-600"}`}>
          지난달 대비 {diff === 0 ? "변동 없음" : `${diff > 0 ? "+" : "-"}${formatKrw(Math.abs(diff))}`}
        </p>
      </div>
      <div className="rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80 p-5">
        <p className="text-xs font-bold text-slate-500 mb-2">결제수단별</p>
        <ul className="space-y-1 text-sm">
          {[...byMethod.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([method, sum]) => (
            <li key={method} className="flex justify-between">
              <span className="text-slate-600 truncate mr-2">{method}</span>
              <span className="font-bold text-slate-800 shrink-0">{formatKrw(sum)}</span>
            </li>
          ))}
          {byMethod.size === 0 && <li className="text-slate-400">지출 없음</li>}
        </ul>
      </div>
      <div className="rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80 p-5">
        <p className="text-xs font-bold text-slate-500 mb-2">분류별</p>
        <ul className="space-y-1 text-sm">
          {[...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([cat, sum]) => (
            <li key={cat} className="flex justify-between">
              <span className="text-slate-600 truncate mr-2">{cat}</span>
              <span className="font-bold text-slate-800 shrink-0">{formatKrw(sum)}</span>
            </li>
          ))}
          {byCategory.size === 0 && <li className="text-slate-400">지출 없음</li>}
        </ul>
      </div>
    </div>
  );
}
