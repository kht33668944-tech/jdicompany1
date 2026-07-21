"use client";

import { useMemo, useState } from "react";
import { formatKrw } from "@/lib/expenses/format";
import { effectiveBillingDay } from "@/lib/expenses/recurring";
import { getDaysInMonth, getFirstDayOfMonth, kstNow } from "@/lib/utils/date";
import type { RecurringExpenseWithMeta } from "@/lib/expenses/types";
import CaretLeft from "phosphor-react/dist/icons/CaretLeft.esm.js";
import CaretRight from "phosphor-react/dist/icons/CaretRight.esm.js";

interface RecurringCalendarProps {
  year: number;
  month: number; // 1-12
  rows: RecurringExpenseWithMeta[];
  isCurrentMonth: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSelectRow: (row: RecurringExpenseWithMeta) => void;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 셀 안에 들어갈 짧은 금액 표기 (예: 35,000 → 3.5만, 800,000 → 80만) */
function compactKrw(n: number): string {
  if (n >= 10000) {
    const man = n / 10000;
    return `${Number.isInteger(man) ? man : man.toFixed(1)}만`;
  }
  return n.toLocaleString("ko-KR");
}

export default function RecurringCalendar({
  year,
  month,
  rows,
  isCurrentMonth,
  onPrev,
  onNext,
  onSelectRow,
}: RecurringCalendarProps) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = getFirstDayOfMonth(year, month);
  const todayDay = useMemo(() => kstNow().getDate(), []);

  // 결제일(말일 초과는 그 달 말일로 클램프)별 활성 고정지출 묶기
  const byDay = useMemo(() => {
    const map = new Map<number, RecurringExpenseWithMeta[]>();
    for (const r of rows) {
      if (!r.is_active) continue;
      const day = effectiveBillingDay(r.billing_day, year, month);
      const list = map.get(day) ?? [];
      list.push(r);
      map.set(day, list);
    }
    return map;
  }, [rows, year, month]);

  const dayTotal = (day: number) =>
    (byDay.get(day) ?? []).reduce((s, r) => s + Number(r.amount_krw), 0);

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const selectedRows = selectedDay != null ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div>
      {/* 월 이동 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrev} className="p-2 rounded-xl hover:bg-slate-100" aria-label="이전 달">
          <CaretLeft size={18} />
        </button>
        <span className="text-sm font-bold text-slate-700">{year}년 {month}월</span>
        <button onClick={onNext} className="p-2 rounded-xl hover:bg-slate-100" aria-label="다음 달">
          <CaretRight size={18} />
        </button>
      </div>

      {/* 요일 */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[11px] font-bold py-1 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-400"}`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day == null) return <div key={`e${idx}`} className="aspect-square md:aspect-auto md:min-h-[104px]" />;
          const items = byDay.get(day) ?? [];
          const has = items.length > 0;
          const isToday = isCurrentMonth && day === todayDay;
          const isSelected = day === selectedDay;
          const dayNumCls = isToday
            ? "text-white bg-[#2563eb] rounded-full w-5 h-5 flex items-center justify-center"
            : has
            ? "text-blue-700"
            : "text-slate-500";
          return (
            <div
              key={day}
              className={`aspect-square md:aspect-auto md:min-h-[104px] rounded-xl border overflow-hidden transition-all ${
                has
                  ? "bg-blue-50 border-blue-200 md:bg-white md:border-slate-100"
                  : "border-transparent md:border-slate-100"
              } ${isSelected ? "ring-2 ring-blue-500" : ""}`}
            >
              {/* 모바일: 칸 전체 탭 → 아래 패널 (기존 유지) */}
              <button
                type="button"
                onClick={() => setSelectedDay(has ? (isSelected ? null : day) : null)}
                disabled={!has}
                className="md:hidden w-full h-full flex flex-col items-center justify-center p-0.5"
              >
                <span className={`text-xs font-bold leading-none ${dayNumCls}`}>{day}</span>
                {has && (
                  <span className="mt-0.5 text-[9px] sm:text-[10px] font-bold text-blue-600 leading-tight truncate max-w-full px-0.5">
                    {compactKrw(dayTotal(day))}
                  </span>
                )}
                {items.length > 1 && <span className="text-[8px] text-blue-400 leading-none">{items.length}건</span>}
              </button>

              {/* 데스크톱: 칸 안에 내용+가격 칩 표시 */}
              <div className="hidden md:flex md:flex-col md:h-full p-1.5 gap-1">
                <span className={`text-sm font-bold leading-none mb-0.5 ${dayNumCls}`}>{day}</span>
                {items.slice(0, 2).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onSelectRow(r)}
                    className="w-full flex items-center justify-between gap-1.5 px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-[13px] leading-tight transition-colors"
                    title={`${r.name} · ${formatKrw(Number(r.amount_krw))}`}
                  >
                    <span className="font-bold text-blue-700 truncate">{r.name}</span>
                    <span className="text-blue-500 shrink-0 font-medium">{Number(r.amount_krw).toLocaleString("ko-KR")}</span>
                  </button>
                ))}
                {items.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className="text-[11px] text-slate-400 hover:text-blue-500 text-left px-1"
                  >
                    +{items.length - 2}건 더
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 선택한 날 내역 */}
      {selectedDay != null && selectedRows.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-500 mb-2 ml-1">
            {month}월 {selectedDay}일 결제 예정 · {formatKrw(dayTotal(selectedDay))}
          </p>
          <div className="space-y-2">
            {selectedRows.map((r) => (
              <button
                key={r.id}
                onClick={() => onSelectRow(r)}
                className="w-full text-left rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-sm px-4 py-2.5 flex items-center gap-3 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{r.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {r.category?.name ?? "미분류"} · {r.payment_method}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-800 shrink-0">{formatKrw(Number(r.amount_krw))}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {byDay.size === 0 && (
        <p className="mt-4 text-center text-xs text-slate-400">이 달에 예정된 고정 지출이 없습니다.</p>
      )}
    </div>
  );
}
