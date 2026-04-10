"use client";

import { useMemo } from "react";
import { CaretLeft, CaretRight, Lock } from "phosphor-react";
import { getDaysInMonth, getFirstDayOfMonth, toDateString, toDateStringFromTimestamp, addDays } from "@/lib/utils/date";
import { getCategoryStyle } from "@/lib/schedule/constants";
import type { ScheduleWithProfile } from "@/lib/schedule/types";

interface MonthlyCalendarProps {
  schedules: ScheduleWithProfile[];
  year: number;
  month: number;
  selectedDate: string | null;
  onDateSelect: (dateStr: string) => void;
  onMonthChange: (year: number, month: number) => void;
  onDateDoubleClick: (dateStr: string) => void;
  onEventClick: (schedule: ScheduleWithProfile) => void;
}

const DAY_HEADERS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MAX_VISIBLE_LANES = 2;
const LANE_H = 22; // px per multi-day lane
const DATE_H = 30; // px reserved for date number

/* ── types ── */

interface MultiDayBar {
  event: ScheduleWithProfile;
  startCol: number; // 0-6
  endCol: number;   // 0-6 inclusive
  lane: number;
}

interface WeekData {
  cells: ({ day: number; dateStr: string; dow: number } | null)[];
  bars: MultiDayBar[];
  singleEvents: Map<string, ScheduleWithProfile[]>;
  laneCount: number;
}

/* ── build week rows ── */

function buildWeeks(schedules: ScheduleWithProfile[], year: number, month: number): WeekData[] {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(daysInMonth)}`;

  // Build week grid
  const weeks: WeekData[] = [];
  let row: WeekData["cells"] = Array(7).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    const col = (firstDay + d - 1) % 7;
    if (d > 1 && col === 0) {
      weeks.push({ cells: row, bars: [], singleEvents: new Map(), laneCount: 0 });
      row = Array(7).fill(null);
    }
    const dateStr = `${year}-${pad(month)}-${pad(d)}`;
    row[col] = { day: d, dateStr, dow: col };
  }
  weeks.push({ cells: row, bars: [], singleEvents: new Map(), laneCount: 0 });

  // Separate multi-day / single-day
  const multiDay: ScheduleWithProfile[] = [];
  const singleDay: ScheduleWithProfile[] = [];
  for (const s of schedules) {
    if (toDateStringFromTimestamp(s.start_time) !== toDateStringFromTimestamp(s.end_time)) {
      multiDay.push(s);
    } else {
      singleDay.push(s);
    }
  }
  multiDay.sort((a, b) => a.start_time.localeCompare(b.start_time) || b.end_time.localeCompare(a.end_time));

  // Assign multi-day events to week rows with greedy lane allocation
  for (const event of multiDay) {
    const eventStart = toDateStringFromTimestamp(event.start_time);
    const eventEnd = toDateStringFromTimestamp(event.end_time);
    const rangeStart = eventStart < monthStart ? monthStart : eventStart;
    const rangeEnd = eventEnd > monthEnd ? monthEnd : eventEnd;

    for (const week of weeks) {
      let startCol = -1;
      let endCol = -1;
      for (let c = 0; c < 7; c++) {
        const cell = week.cells[c];
        if (cell && cell.dateStr >= rangeStart && cell.dateStr <= rangeEnd) {
          if (startCol === -1) startCol = c;
          endCol = c;
        }
      }
      if (startCol === -1) continue;

      // Find first free lane
      const occupied = new Set<number>();
      for (const bar of week.bars) {
        if (bar.startCol <= endCol && bar.endCol >= startCol) occupied.add(bar.lane);
      }
      let lane = 0;
      while (occupied.has(lane)) lane++;

      week.bars.push({ event, startCol, endCol, lane });
      week.laneCount = Math.max(week.laneCount, lane + 1);
    }
  }

  // Assign single-day events
  for (const event of singleDay) {
    const dateStr = toDateStringFromTimestamp(event.start_time);
    for (const week of weeks) {
      for (const cell of week.cells) {
        if (cell?.dateStr === dateStr) {
          const arr = week.singleEvents.get(dateStr) ?? [];
          arr.push(event);
          week.singleEvents.set(dateStr, arr);
        }
      }
    }
  }

  return weeks;
}

/* ── component ── */

export default function MonthlyCalendar({
  schedules,
  year,
  month,
  selectedDate,
  onDateSelect,
  onMonthChange,
  onDateDoubleClick,
  onEventClick,
}: MonthlyCalendarProps) {
  const todayStr = toDateString();
  const weeks = useMemo(() => buildWeeks(schedules, year, month), [schedules, year, month]);

  const prevMonth = () => {
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    onMonthChange(y, m);
  };
  const nextMonth = () => {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    onMonthChange(y, m);
  };

  return (
    <div className="glass-card rounded-2xl p-6">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <CaretLeft size={20} />
        </button>
        <h3 className="text-lg font-bold text-slate-800">
          {year}년 {month}월
        </h3>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <CaretRight size={20} />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_HEADERS.map((day, i) => (
          <div
            key={day}
            className={`text-center text-xs font-semibold py-2 ${
              i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-400"
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 주별 행 */}
      {weeks.map((week, wi) => {
        const visibleLanes = Math.min(week.laneCount, MAX_VISIBLE_LANES);
        const barArea = visibleLanes * LANE_H;

        return (
          <div key={wi} className="relative grid grid-cols-7">
            {/* 날짜 셀 (배경 · 클릭 영역) */}
            {week.cells.map((cell, col) => {
              if (!cell) return <div key={col} className="min-h-[120px]" />;

              const isToday = cell.dateStr === todayStr;
              const isSelected = cell.dateStr === selectedDate;
              const singles = week.singleEvents.get(cell.dateStr) ?? [];
              const hiddenBars = week.bars.filter(
                (b) => b.lane >= MAX_VISIBLE_LANES && b.startCol <= col && b.endCol >= col,
              ).length;
              const extraCount = hiddenBars + Math.max(0, singles.length - 2);

              return (
                <div
                  key={col}
                  onClick={() => onDateSelect(cell.dateStr)}
                  onDoubleClick={() => onDateDoubleClick(cell.dateStr)}
                  className={`min-h-[120px] p-2 rounded-xl text-left transition-all duration-150 hover:bg-slate-50 cursor-pointer ${
                    isSelected ? "ring-2 ring-brand-400 bg-brand-50/30" : ""
                  }`}
                >
                  {/* 날짜 숫자 */}
                  <div className="flex justify-start mb-1.5">
                    <span
                      className={`inline-flex items-center justify-center text-sm font-bold ${
                        isToday
                          ? "bg-brand-500 text-white rounded-full w-7 h-7"
                          : cell.dow === 0
                            ? "text-red-400"
                            : cell.dow === 6
                              ? "text-blue-400"
                              : "text-slate-700"
                      }`}
                    >
                      {cell.day}
                    </span>
                  </div>

                  {/* multi-day 바 공간 확보 */}
                  {barArea > 0 && <div style={{ height: barArea }} />}

                  {/* single-day 이벤트 */}
                  <div className="space-y-1">
                    {singles.slice(0, 2).map((event) => {
                      const config = getCategoryStyle(event.category);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(event);
                          }}
                          className={`w-full text-left text-xs leading-normal px-2 py-1 rounded-lg truncate shadow-sm ${config.bg} hover:shadow-md transition-all ${
                            event.visibility === "private" ? "border border-dashed border-slate-300" : ""
                          }`}
                          title={event.title}
                        >
                          <span className="flex items-center gap-1">
                            {event.visibility === "private" && (
                              <Lock size={10} className="shrink-0 text-amber-500" />
                            )}
                            <span className={`truncate font-medium ${config.text}`}>{event.title}</span>
                          </span>
                        </button>
                      );
                    })}
                    {extraCount > 0 && (
                      <div className="text-xs text-slate-400 px-1 font-medium">+{extraCount}개</div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* multi-day 바 (absolute overlay) */}
            {week.bars
              .filter((b) => b.lane < MAX_VISIBLE_LANES)
              .map((bar) => {
                const config = getCategoryStyle(bar.event.category);
                const span = bar.endCol - bar.startCol + 1;
                return (
                  <div
                    key={`${bar.event.id}-w${wi}`}
                    className="absolute z-10"
                    style={{
                      top: DATE_H + bar.lane * LANE_H,
                      left: `calc(${bar.startCol} * 100% / 7 + 6px)`,
                      width: `calc(${span} * 100% / 7 - 12px)`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(bar.event);
                      }}
                      className={`w-full text-left text-xs leading-normal px-2 py-1 rounded-lg truncate shadow-sm ${config.bg} hover:shadow-md transition-all ${
                        bar.event.visibility === "private" ? "border border-dashed border-slate-300" : ""
                      }`}
                      title={bar.event.title}
                    >
                      <span className="flex items-center gap-1">
                        {bar.event.visibility === "private" && (
                          <Lock size={10} className="shrink-0 text-amber-500" />
                        )}
                        <span className={`truncate font-medium ${config.text}`}>{bar.event.title}</span>
                      </span>
                    </button>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
