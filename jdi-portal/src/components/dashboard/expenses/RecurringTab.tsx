"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getRecurringExpenses, getRecurringRecordedIds } from "@/lib/expenses/queries";
import { setRecurringActive } from "@/lib/expenses/actions";
import { recurringStatus, type RecurringStatus } from "@/lib/expenses/recurring";
import { getMonthRange, kstNow } from "@/lib/utils/date";
import { formatKrw, formatForeign } from "@/lib/expenses/format";
import { categoryStyle } from "@/lib/expenses/constants";
import type {
  ExpenseCategory,
  PaymentMethod,
  RecurringExpenseWithMeta,
} from "@/lib/expenses/types";
import RecurringFormModal from "./RecurringFormModal";
import RecurringCalendar from "./RecurringCalendar";
import Select, { type SelectOption } from "@/components/shared/Select";

const FILTER_CLS = "w-full md:w-auto bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm";

interface RecurringTabProps {
  recurring: RecurringExpenseWithMeta[];
  categories: ExpenseCategory[];
  profiles: { id: string; full_name: string }[];
  userId: string;
  userRole: "employee" | "admin" | "developer";
  paymentMethods: PaymentMethod[];
  onMethodsChanged: () => void;
  onCategoriesChanged: () => void;
  /** 부모(헤더 버튼)가 여는 등록 모달 상태 */
  createOpen: boolean;
  onCreateClose: () => void;
}

const BADGE_STYLE: Record<RecurringStatus, { cls: string; label: string }> = {
  recorded: { cls: "bg-emerald-50 text-emerald-600", label: "이번 달 기록됨" },
  upcoming: { cls: "bg-blue-50 text-blue-600", label: "예정" },
  overdue: { cls: "bg-amber-50 text-amber-600", label: "미기록" },
};
const SEG_ACTIVE = "bg-white shadow text-blue-600";
const SEG_INACTIVE = "text-slate-500";

export default function RecurringTab({ recurring: initial, categories, profiles, userId, paymentMethods, onMethodsChanged, onCategoriesChanged, createOpen, onCreateClose }: RecurringTabProps) {
  const [rows, setRows] = useState(initial);
  const [recordedIds, setRecordedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<RecurringExpenseWithMeta | null>(null);
  const [view, setView] = useState<"calendar" | "list">("calendar");

  // 필터(목록 뷰)
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "stopped">("");

  // 현재 KST 연/월/일 (렌더마다 재계산 방지) — 배지/기록 상태 기준
  const cur = useMemo(() => {
    const now = kstNow();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }, []);

  // 캘린더 표시 월 (이동 가능)
  const [calYear, setCalYear] = useState(cur.year);
  const [calMonth, setCalMonth] = useState(cur.month);

  const loadRecorded = async () => {
    try {
      const { start, end } = getMonthRange(cur.year, cur.month);
      const ids = await getRecurringRecordedIds(createClient(), start, end);
      setRecordedIds(new Set(ids));
    } catch {
      // 기록 상태 조회 실패는 조용히 무시 (배지만 안 보임)
    }
  };

  useEffect(() => {
    loadRecorded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    try {
      const supabase = createClient();
      const [list] = await Promise.all([getRecurringExpenses(supabase), loadRecorded()]);
      setRows(list);
    } catch {
      toast.error("목록을 불러오지 못했습니다.");
    }
  };

  const activeRows = useMemo(() => rows.filter((r) => r.is_active), [rows]);
  const monthlyTotal = useMemo(
    () => activeRows.reduce((s, r) => s + Number(r.amount_krw), 0),
    [activeRows]
  );
  const recordedCount = useMemo(
    () => activeRows.filter((r) => recordedIds.has(r.id)).length,
    [activeRows, recordedIds]
  );

  // 분류별 고정비 (활성 기준)
  const categoryRows = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of activeRows) {
      const name = r.category?.name ?? "미분류";
      map.set(name, (map.get(name) ?? 0) + Number(r.amount_krw));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [activeRows]);

  // 목록 필터
  const methods = useMemo(() => [...new Set(rows.map((r) => r.payment_method))].sort(), [rows]);
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
    return rows.filter((r) => {
      if (statusFilter === "active" && !r.is_active) return false;
      if (statusFilter === "stopped" && r.is_active) return false;
      if (categoryFilter && r.category_id !== categoryFilter) return false;
      if (methodFilter && r.payment_method !== methodFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.name.toLowerCase().includes(q) && !(r.vendor ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, categoryFilter, methodFilter, statusFilter]);

  const handleToggle = async (row: RecurringExpenseWithMeta) => {
    try {
      await setRecurringActive(row.id, !row.is_active);
      toast.success(row.is_active ? "중지되었습니다." : "다시 활성화되었습니다.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "변경에 실패했습니다.");
    }
  };

  const moveCalMonth = (delta: number) => {
    const d = new Date(calYear, calMonth - 1 + delta, 1);
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth() + 1);
  };

  // 활성 항목의 이번 달 기록 배지
  const renderBadge = (r: RecurringExpenseWithMeta) => {
    const status = recurringStatus(r, recordedIds, cur);
    if (!status) return null;
    const b = BADGE_STYLE[status];
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${b.cls}`}>{b.label}</span>;
  };

  return (
    <div className="space-y-4">
      {/* 통합 카드: 요약 + 뷰 전환 + 내용 */}
      <div className="rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80 shadow-sm p-4 sm:p-5 space-y-4">
        {/* 요약 헤더 + 뷰 토글(우측) */}
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="flex items-end gap-4 sm:gap-6 flex-wrap">
            <div>
              <p className="text-xs font-bold text-slate-500">월 고정비 총액</p>
              <p className="text-lg md:text-2xl font-bold text-slate-800 mt-0.5">{formatKrw(monthlyTotal)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500">활성 항목</p>
              <p className="text-lg md:text-2xl font-bold text-slate-800 mt-0.5">{activeRows.length}개</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500">이번 달 기록</p>
              <p className="text-lg md:text-2xl font-bold text-slate-800 mt-0.5">{recordedCount}/{activeRows.length}</p>
            </div>
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-bold w-full sm:w-auto">
            {([["calendar", "캘린더"], ["list", "목록"]] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex-1 sm:flex-none px-5 py-1.5 rounded-lg transition-all ${view === v ? SEG_ACTIVE : SEG_INACTIVE}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* 내용 */}
        {view === "calendar" ? (
          <RecurringCalendar
            year={calYear}
            month={calMonth}
            rows={rows}
            isCurrentMonth={calYear === cur.year && calMonth === cur.month}
            onPrev={() => moveCalMonth(-1)}
            onNext={() => moveCalMonth(1)}
            onSelectRow={setEditing}
          />
        ) : (
          <div className="space-y-3">
            {/* 검색 + 필터 */}
            <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름·거래처 검색"
                className="w-full md:flex-1 md:min-w-[180px] bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold shrink-0">
                {([["", "전체"], ["active", "진행중"], ["stopped", "중지"]] as const).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setStatusFilter(v)}
                    className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg transition-all ${statusFilter === v ? SEG_ACTIVE : SEG_INACTIVE}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* 목록 */}
            <div className="space-y-2">
              {filtered.length === 0 && (
                <div className="rounded-xl bg-white border border-slate-200 p-10 text-center text-sm text-slate-400">
                  {rows.length === 0 ? "등록된 고정 지출이 없습니다. 구독·월세·관리비를 등록해보세요." : "조건에 맞는 고정 지출이 없습니다."}
                </div>
              )}
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${r.is_active ? "bg-white border-slate-200 hover:border-blue-300 transition-colors" : "bg-slate-100/60 border-slate-200 opacity-60"}`}
                >
                  <button onClick={() => setEditing(r)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-800 truncate">
                        {r.name}
                        {!r.is_active && <span className="ml-2 text-xs text-slate-400">(중지됨)</span>}
                      </p>
                      {renderBadge(r)}
                    </div>
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
          </div>
        )}

      </div>

      {/* 분류별 고정비 (아래로 이동) */}
      {categoryRows.length > 0 && (
        <div className="rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80 shadow-sm p-4">
          <p className="text-xs font-bold text-slate-500 mb-3">분류별 고정비</p>
          <div className="space-y-2.5">
            {categoryRows.map(([name, sum]) => (
              <div key={name}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600 truncate mr-2">{name}</span>
                  <span className="font-bold text-slate-800 shrink-0">{formatKrw(sum)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#2563eb]"
                    style={{ width: `${monthlyTotal > 0 ? Math.max(4, (sum / monthlyTotal) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(createOpen || editing) && (
        <RecurringFormModal
          initial={editing}
          categories={categories}
          profiles={profiles}
          paymentMethods={paymentMethods}
          onMethodsChanged={onMethodsChanged}
          onCategoriesChanged={onCategoriesChanged}
          defaultOwnerId={userId}
          onClose={() => {
            onCreateClose();
            setEditing(null);
          }}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
