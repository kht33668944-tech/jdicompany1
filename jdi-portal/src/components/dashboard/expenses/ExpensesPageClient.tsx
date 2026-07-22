"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { getExpenseCategories, getExpensesByRange, getPaymentMethods, getRangeKrwTotal } from "@/lib/expenses/queries";
import { getMonthRange } from "@/lib/utils/date";
import type {
  ExpenseCategory,
  ExpenseWithMeta,
  PaymentMethod,
  RecurringExpenseWithMeta,
} from "@/lib/expenses/types";
import ExpenseSummary from "./ExpenseSummary";
import ExpenseList from "./ExpenseList";
import ExpenseQuickInput from "./ExpenseQuickInput";
import ExcelDownloadButton from "./ExcelDownloadButton";
import CaretLeft from "phosphor-react/dist/icons/CaretLeft.esm.js";
import CaretRight from "phosphor-react/dist/icons/CaretRight.esm.js";
import Plus from "phosphor-react/dist/icons/Plus.esm.js";

const RecurringTab = dynamic(() => import("./RecurringTab"), {
  ssr: false,
  loading: () => <div className="h-40 rounded-2xl bg-slate-200/60 animate-pulse" />,
});

const ExpenseEditModal = dynamic(() => import("./ExpenseEditModal"), { ssr: false });

interface ExpensesPageClientProps {
  initialExpenses: ExpenseWithMeta[];
  categories: ExpenseCategory[];
  recurring: RecurringExpenseWithMeta[];
  prevMonthTotal: number;
  userId: string;
  userRole: "employee" | "admin" | "developer";
  profiles: { id: string; full_name: string }[];
  canViewSensitive: boolean;
  initialPaymentMethods: PaymentMethod[];
}

export default function ExpensesPageClient({
  initialExpenses,
  categories,
  recurring,
  prevMonthTotal: initialPrevTotal,
  userId,
  userRole,
  profiles,
  canViewSensitive,
  initialPaymentMethods,
}: ExpensesPageClientProps) {
  const kstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const [tab, setTab] = useState<"list" | "recurring">("list");
  const [year, setYear] = useState(kstNow.getFullYear());
  const [month, setMonth] = useState(kstNow.getMonth() + 1);
  const [expenses, setExpenses] = useState<ExpenseWithMeta[]>(initialExpenses);
  const [prevTotal, setPrevTotal] = useState(initialPrevTotal);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ExpenseWithMeta | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(initialPaymentMethods);
  const [allCategories, setAllCategories] = useState<ExpenseCategory[]>(categories);
  const [recurringCreateSignal, setRecurringCreateSignal] = useState(0);
  const didMount = useRef(false);

  const inputCategories = useMemo(
    () => (canViewSensitive ? allCategories : allCategories.filter((c) => !c.is_sensitive)),
    [canViewSensitive, allCategories]
  );

  const refreshPaymentMethods = useCallback(async () => {
    try {
      setPaymentMethods(await getPaymentMethods(createClient()));
    } catch {
      // 목록 갱신 실패는 조용히 무시 (다음 새로고침에서 반영)
    }
  }, []);

  const refreshCategories = useCallback(async () => {
    try {
      setAllCategories(await getExpenseCategories(createClient()));
    } catch {
      // 목록 갱신 실패는 조용히 무시 (다음 새로고침에서 반영)
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { start, end } = getMonthRange(year, month);
      const prevYear = month === 1 ? year - 1 : year;
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevRange = getMonthRange(prevYear, prevMonth);
      const [rows, prev] = await Promise.all([
        getExpensesByRange(supabase, start, end),
        getRangeKrwTotal(supabase, prevRange.start, prevRange.end),
      ]);
      setExpenses(rows);
      setPrevTotal(prev);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    refresh();
  }, [refresh]);

  const moveMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const monthLabel = useMemo(() => `${year}년 ${month}월`, [year, month]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-800">지출 관리</h1>
          <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-bold">
            <button
              onClick={() => setTab("list")}
              className={`px-4 py-1.5 rounded-lg transition-all ${tab === "list" ? "bg-white shadow text-blue-600" : "text-slate-500"}`}
            >
              지출 내역
            </button>
            <button
              onClick={() => setTab("recurring")}
              className={`px-4 py-1.5 rounded-lg transition-all ${tab === "recurring" ? "bg-white shadow text-blue-600" : "text-slate-500"}`}
            >
              고정 지출
            </button>
          </div>
        </div>
        {tab === "list" && (
          <div className="flex items-center gap-2">
            <button onClick={() => moveMonth(-1)} className="p-2 rounded-xl hover:bg-slate-100" aria-label="이전 달">
              <CaretLeft size={18} />
            </button>
            <span className="text-sm font-bold text-slate-700 min-w-[90px] text-center">{monthLabel}</span>
            <button onClick={() => moveMonth(1)} className="p-2 rounded-xl hover:bg-slate-100" aria-label="다음 달">
              <CaretRight size={18} />
            </button>
            <div className="hidden md:block">
              <ExcelDownloadButton expenses={expenses} year={year} month={month} />
            </div>
          </div>
        )}
        {tab === "recurring" && (
          <button
            onClick={() => setRecurringCreateSignal((n) => n + 1)}
            className="flex items-center gap-1.5 rounded-xl bg-[#2563eb] text-white text-sm font-bold px-4 py-2 hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
          >
            <Plus size={16} weight="bold" /> 고정 지출 등록
          </button>
        )}
      </div>

      {tab === "list" ? (
        <>
          <ExpenseSummary expenses={expenses} prevMonthTotal={prevTotal} />
          <ExpenseQuickInput categories={inputCategories} paymentMethods={paymentMethods} onMethodsChanged={refreshPaymentMethods} onCategoriesChanged={refreshCategories} onCreated={refresh} />
          <ExpenseList expenses={expenses} categories={allCategories} onChanged={refresh} loading={loading} onSelect={setSelected} />
        </>
      ) : (
        <RecurringTab
          recurring={recurring}
          categories={inputCategories}
          profiles={profiles}
          userId={userId}
          userRole={userRole}
          paymentMethods={paymentMethods}
          onMethodsChanged={refreshPaymentMethods}
          onCategoriesChanged={refreshCategories}
          openCreateSignal={recurringCreateSignal}
        />
      )}

      {selected && (
        <ExpenseEditModal
          expense={selected}
          categories={inputCategories}
          paymentMethods={paymentMethods}
          onMethodsChanged={refreshPaymentMethods}
          onCategoriesChanged={refreshCategories}
          onClose={() => setSelected(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
