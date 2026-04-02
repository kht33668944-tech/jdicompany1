"use client";

import { useMemo } from "react";
import { CaretLeft, CaretRight, Lock } from "phosphor-react";
import { addDays, toDateString, toDateStringFromTimestamp, formatTime, getHourFromTimestamp } from "@/lib/utils/date";
import { getCategoryStyle } from "@/lib/schedule/constants";
import type { ScheduleWithProfile } from "@/lib/schedule/types";

interface WeeklyViewProps {
  schedules: ScheduleWithProfile[];
  selectedDate: string;
  onDateSelect: (dateStr: string) => void;
  onWeekChange: (dateStr: string) => void;
  onEventClick: (schedule: ScheduleWithProfile) => void;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 ~ 20:00
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function getWeekStart(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00+09:00`);
  const day = date.getDay();
  return addDays(dateStr, -day);
}

export default function WeeklyView({
  schedules,
  selectedDate,
  onDateSelect,
  onWeekChange,
  onEventClick,
}: WeeklyViewProps) {
  const todayStr = toDateString();
  const weekStart = getWeekStart(selectedDate);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const eventsByDayAndHour = useMemo(() => {
    const map = new Map<string, ScheduleWithProfile[]>();
    for (const schedule of schedules) {
      if (schedule.is_all_day) {
        const start = toDateStringFromTimestamp(schedule.start_time);
        const end = toDateStringFromTimestamp(schedule.end_time);
        for (const day of weekDays) {
          if (day >= start && day <= end) {
            const key = `${day}-allday`;
            const arr = map.get(key) ?? [];
            arr.push(schedule);
            map.set(key, arr);
          }
        }
        continue;
      }
      const startDate = toDateStringFromTimestamp(schedule.start_time);
      const hour = getHourFromTimestamp(schedule.start_time);
      if (weekDays.includes(startDate)) {
        const key = `${startDate}-${hour}`;
        const arr = map.get(key) ?? [];
        arr.push(schedule);
        map.set(key, arr);
      }
    }
    return map;
  }, [schedules, weekDays]);

  const prevWeek = () => onWeekChange(addDays(weekStart, -7));
  const nextWeek = () => onWeekChange(addDays(weekStart, 7));

  const weekLabel = (() => {
    const start = new Date(`${weekStart}T12:00:00+09:00`);
    const end = new Date(`${addDays(weekStart, 6)}T12:00:00+09:00`);
    const sMonth = start.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long" });
    const sDay = start.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", day: "numeric" });
    const eDay = end.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", day: "numeric" });
    return `${sMonth} ${sDay} - ${eDay}`;
  })();

  return (
    <div className="glass-card rounded-2xl p-6">
      {/* 주간 네비게이션 */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button
          onClick={prevWeek}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <CaretLeft size={20} />
        </button>
        <h3 className="text-lg font-bold text-slate-800">{weekLabel}</h3>
        <button
          onClick={nextWeek}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <CaretRight size={20} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-8 gap-px mb-1">
            <div className="p-2" />
            {weekDays.map((day, i) => {
              const isToday = day === todayStr;
              const isSelected = day === selectedDate;
              const dayNum = day.slice(8, 10);
              return (
                <button
                  key={day}
                  onClick={() => onDateSelect(day)}
                  className={`p-2 text-center rounded-xl transition-colors ${
                    isSelected ? "bg-brand-50" : "hover:bg-slate-50"
                  }`}
                >
                  <div
                    className={`text-xs font-semibold ${
                      i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-400"
                    }`}
                  >
                    {DAY_LABELS[i]}
                  </div>
                  <div
                    className={`text-sm font-bold mt-1 ${
                      isToday
                        ? "bg-brand-500 text-white rounded-full w-7 h-7 flex items-center justify-center mx-auto"
                        : i === 0
                          ? "text-red-400"
                          : i === 6
                            ? "text-blue-400"
                            : "text-slate-700"
                    }`}
                  >
                    {Number(dayNum)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 종일 이벤트 행 */}
          {weekDays.some((day) => (eventsByDayAndHour.get(`${day}-allday`) ?? []).length > 0) && (
            <div className="grid grid-cols-8 gap-px border-b border-slate-100 pb-2 mb-2">
              <div className="p-2 text-[10px] text-slate-400 font-medium">종일</div>
              {weekDays.map((day) => {
                const events = eventsByDayAndHour.get(`${day}-allday`) ?? [];
                return (
                  <div key={day} className="p-1 space-y-0.5">
                    {events.map((event) => {
                      const config = getCategoryStyle(event.category);
                      return (
                        <button
                          key={event.id}
                          onClick={() => onEventClick(event)}
                          className={`w-full text-left text-[10px] leading-tight px-1.5 py-0.5 rounded truncate ${config.badge} ${event.visibility === "private" ? "border border-dashed border-slate-300" : ""}`}
                          title={event.title}
                        >
                          <span className="flex items-center gap-0.5">
                            {event.visibility === "private" && <Lock size={8} className="shrink-0" />}
                            <span className="truncate">{event.title}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* 시간대별 그리드 */}
          <div className="max-h-[500px] overflow-y-auto">
            {HOURS.map((hour) => (
              <div key={hour} className="grid grid-cols-8 gap-px border-b border-slate-50">
                <div className="p-2 text-[10px] text-slate-400 font-medium tabular-nums">
                  {String(hour).padStart(2, "0")}:00
                </div>
                {weekDays.map((day) => {
                  const events = eventsByDayAndHour.get(`${day}-${hour}`) ?? [];
                  return (
                    <div key={`${day}-${hour}`} className="p-1 min-h-[48px]">
                      {events.map((event) => {
                        const config = getCategoryStyle(event.category);
                        return (
                          <button
                            key={event.id}
                            onClick={() => onEventClick(event)}
                            className={`w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded ${config.badge} hover:opacity-80 transition-opacity ${event.visibility === "private" ? "border border-dashed border-slate-300" : ""}`}
                            title={event.title}
                          >
                            <div className="font-medium truncate flex items-center gap-0.5">
                              {event.visibility === "private" && <Lock size={8} className="shrink-0" />}
                              {event.title}
                            </div>
                            <div className="opacity-70">
                              {formatTime(event.start_time)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
