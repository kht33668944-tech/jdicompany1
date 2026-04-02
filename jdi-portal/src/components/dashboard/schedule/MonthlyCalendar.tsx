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
const MAX_VISIBLE_EVENTS = 2;

function buildDateEventsMap(schedules: ScheduleWithProfile[], year: number, month: number) {
  const map = new Map<string, ScheduleWithProfile[]>();
  const daysInMonth = getDaysInMonth(year, month);
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  for (const schedule of schedules) {
    const eventStart = toDateStringFromTimestamp(schedule.start_time);
    const eventEnd = toDateStringFromTimestamp(schedule.end_time);
    const rangeStart = eventStart < monthStart ? monthStart : eventStart;
    const rangeEnd = eventEnd > monthEnd ? monthEnd : eventEnd;

    let current = rangeStart;
    while (current <= rangeEnd) {
      const existing = map.get(current) ?? [];
      existing.push(schedule);
      map.set(current, existing);
      current = addDays(current, 1);
    }
  }

  return map;
}

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
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayStr = toDateString();
  const dateEventsMap = useMemo(() => buildDateEventsMap(schedules, year, month), [schedules, year, month]);

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
      <div className="grid grid-cols-7 gap-1 mb-2">
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

      {/* 캘린더 그리드 */}
      <div className="grid grid-cols-7 gap-1">
        {/* 빈 셀 */}
        {Array.from({ length: firstDay }).map((_, index) => (
          <div key={`empty-${index}`} className="min-h-[120px]" />
        ))}

        {/* 날짜 셀 */}
        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayOfWeek = (firstDay + index) % 7;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const events = dateEventsMap.get(dateStr) ?? [];
          const extraCount = events.length - MAX_VISIBLE_EVENTS;

          return (
            <div
              key={day}
              onClick={() => onDateSelect(dateStr)}
              onDoubleClick={() => onDateDoubleClick(dateStr)}
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
                      : dayOfWeek === 0
                        ? "text-red-400"
                        : dayOfWeek === 6
                          ? "text-blue-400"
                          : "text-slate-700"
                  }`}
                >
                  {day}
                </span>
              </div>

              {/* 이벤트 태그 */}
              <div className="space-y-1">
                {events.slice(0, MAX_VISIBLE_EVENTS).map((event) => {
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
                        {event.visibility === "private" && <Lock size={10} className="shrink-0 text-amber-500" />}
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
      </div>
    </div>
  );
}
