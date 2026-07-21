"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getRecurringExpenses } from "@/lib/expenses/queries";
import { setRecurringActive } from "@/lib/expenses/actions";
import { formatKrw, formatForeign } from "@/lib/expenses/format";
import type {
  ExpenseCategory,
  RecurringExpenseWithMeta,
} from "@/lib/expenses/types";
import RecurringFormModal from "./RecurringFormModal";
import Plus from "phosphor-react/dist/icons/Plus.esm.js";

interface RecurringTabProps {
  recurring: RecurringExpenseWithMeta[];
  categories: ExpenseCategory[];
  profiles: { id: string; full_name: string }[];
  userId: string;
  userRole: "employee" | "admin" | "developer";
}

export default function RecurringTab({ recurring: initial, categories, profiles, userId }: RecurringTabProps) {
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<RecurringExpenseWithMeta | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    try {
      const supabase = createClient();
      setRows(await getRecurringExpenses(supabase));
    } catch {
      toast.error("목록을 불러오지 못했습니다.");
    }
  };

  const activeRows = rows.filter((r) => r.is_active);
  const monthlyTotal = useMemo(
    () => activeRows.reduce((s, r) => s + Number(r.amount_krw), 0),
    [activeRows]
  );

  const handleToggle = async (row: RecurringExpenseWithMeta) => {
    try {
      await setRecurringActive(row.id, !row.is_active);
      toast.success(row.is_active ? "중지되었습니다." : "다시 활성화되었습니다.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "변경에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80 px-5 py-4">
          <p className="text-xs font-bold text-slate-500">월 고정비 총액 (원화 기준)</p>
          <p className="text-xl font-bold text-slate-800 mt-0.5">{formatKrw(monthlyTotal)}</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#2563eb] text-white text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
        >
          <Plus size={16} weight="bold" /> 고정 지출 등록
        </button>
      </div>

      <div className="space-y-2">
        {rows.length === 0 && (
          <div className="rounded-2xl bg-white/65 border border-white/80 p-10 text-center text-sm text-slate-400">
            등록된 고정 지출이 없습니다. 구독·월세·관리비를 등록해보세요.
          </div>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            className={`rounded-2xl border px-5 py-3.5 flex items-center gap-3 ${r.is_active ? "bg-white/65 backdrop-blur-sm border-white/80" : "bg-slate-100/60 border-slate-200 opacity-60"}`}
          >
            <button onClick={() => setEditing(r)} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-bold text-slate-800 truncate">
                {r.name}
                {!r.is_active && <span className="ml-2 text-xs text-slate-400">(중지됨)</span>}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                매달 {r.billing_day}일 · {r.category?.name ?? "미분류"} · {r.payment_method}
                {r.owner_profile ? ` · 담당 ${r.owner_profile.full_name}` : ""}
              </p>
            </button>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-slate-800">{formatKrw(Number(r.amount_krw))}</p>
              {r.currency === "USD" && r.amount_foreign != null && (
                <p className="text-xs text-slate-400">{formatForeign(Number(r.amount_foreign), "USD")}</p>
              )}
            </div>
            <button
              onClick={() => handleToggle(r)}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all"
            >
              {r.is_active ? "중지" : "재개"}
            </button>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <RecurringFormModal
          initial={editing}
          categories={categories}
          profiles={profiles}
          defaultOwnerId={userId}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
