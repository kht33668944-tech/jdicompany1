"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils/date";
import { formatKrw, formatForeign, parseKrwInput } from "@/lib/expenses/format";
import { confirmExpenseAmount } from "@/lib/expenses/actions";
import { EXPENSE_SOURCE_LABEL, categoryStyle } from "@/lib/expenses/constants";
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

export default function ExpenseList({ expenses, categories, onChanged, loading, onSelect }: ExpenseListProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const pendingCount = useMemo(() => expenses.filter((e) => e.amount_pending).length, [expenses]);

  const methods = useMemo(
    () => [...new Set(expenses.map((e) => e.payment_method))].sort(),
    [expenses]
  );

  const categoryOptions: SelectOption[] = useMemo(
    () => [
      { value: "", label: "전체 분류" },
      ...categories.map((c) => ({ value: c.id, label: c.name, dotClass: categoryStyle(c.color_key).dot })),
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

      {pendingCount > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-700 font-medium flex items-center gap-2">
          ⚠️ 이번 달 금액을 아직 안 넣은 변동성 지출 {pendingCount}건이 있어요. 합계가 실제보다 적을 수 있습니다.
        </div>
      )}

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
              const style = categoryStyle(e.category?.color_key);
              const isRecurring = e.source === "recurring";

              // 변동성 자동기록(미확정): 빨강 강조 + 인라인 금액 입력 (입력 상태는 행 컴포넌트가 자체 보유)
              if (e.amount_pending) {
                return <PendingExpenseRow key={e.id} expense={e} dotClass={style.dot} onConfirmed={onChanged} />;
              }

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

/**
 * 변동성 자동기록(미확정) 행 — 인라인 금액 입력.
 * 입력 상태를 자체 보유해, 키 입력마다 리스트 전체가 재렌더되지 않게 한다.
 */
function PendingExpenseRow({
  expense: e,
  dotClass,
  onConfirmed,
}: {
  expense: ExpenseWithMeta;
  dotClass: string;
  onConfirmed: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amtInput, setAmtInput] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const val = parseKrwInput(amtInput);
    if (!Number.isFinite(val) || val <= 0) {
      toast.error("금액을 숫자로 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      await confirmExpenseAmount(e.id, val);
      toast.success("금액이 확정되었습니다.");
      onConfirmed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-red-200 bg-red-50/70 px-5 py-3.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">
            {e.vendor ? `${e.vendor} · ` : ""}{e.description}
          </p>
          <span className="inline-flex items-center rounded-full bg-red-100 text-red-600 text-[11px] font-bold px-2 py-0.5 shrink-0">입력 필요</span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5 truncate flex items-center gap-1">
          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
          {e.category?.name ?? "미분류"} · {e.payment_method}
        </p>
      </div>
      {editing ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            autoFocus
            value={amtInput}
            onChange={(ev) => setAmtInput(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === "Enter") submit(); }}
            inputMode="numeric"
            placeholder="금액"
            className="w-28 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={submit} disabled={saving} className="px-3 py-1.5 rounded-lg bg-[#2563eb] text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50">저장</button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600"
        >
          금액 입력
        </button>
      )}
    </div>
  );
}
