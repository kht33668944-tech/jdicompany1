"use client";

import { useMemo } from "react";
import { CaretLeft, CaretRight, MapPin, Monitor, Lock } from "phosphor-react";
import { addDays, toDateString, toDateStringFromTimestamp, formatTime } from "@/lib/utils/date";
import { getCategoryStyle } from "@/lib/schedule/constants";
import type { ScheduleWithProfile } from "@/lib/schedule/types";

interface DailyViewProps {
  schedules: ScheduleWithProfile[];
  selectedDate: string;
  onDateSelect: (dateStr: string) => void;
  onEventClick: (schedule: ScheduleWithProfile) => void;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 ~ 20:00

function getHour(isoString: string): number {
  const date = new Date(isoString);
  return Number(
    date.toLocaleTimeString("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false })
  );
}

function formatDateHeader(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00+09:00`).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export default function DailyView({
  schedules,
  selectedDate,
  onDateSelect,
  onEventClick,
}: DailyViewProps) {
  const todayStr = toDateString();
  const isToday = selectedDate === todayStr;

  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: ScheduleWithProfile[] = [];
    const timed = new Map<number, ScheduleWithProfile[]>();

    for (const schedule of schedules) {
      const start = toDateStringFromTimestamp(schedule.start_time);
      const end = toDateStringFromTimestamp(schedule.end_time);
      if (selectedDate < start || selectedDate > end) continue;

      if (schedule.is_all_day) {
        allDay.push(schedule);
      } else {
        const hour = getHour(schedule.start_time);
        const arr = timed.get(hour) ?? [];
        arr.push(schedule);
        timed.set(hour, arr);
      }
    }

    return { allDayEvents: allDay, timedEvents: timed };
  }, [schedules, selectedDate]);

  const prevDay = () => onDateSelect(addDays(selectedDate, -1));
  const nextDay = () => onDateSelect(addDays(selectedDate, 1));

  return (
    <div className="glass-card rounded-2xl p-6">
      {/* 날짜 네비게이션 */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button
          onClick={prevDay}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <CaretLeft size={20} />
        </button>
        <div className="text-center">
          <h3 className="text-lg font-bold text-slate-800">{formatDateHeader(selectedDate)}</h3>
          {isToday && <span className="text-xs text-brand-600 font-medium">오늘</span>}
        </div>
        <button
          onClick={nextDay}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <CaretRight size={20} />
        </button>
      </div>

      {/* 종일 이벤트 */}
      {allDayEvents.length > 0 && (
        <div className="mb-4 pb-4 border-b border-slate-100">
          <div className="text-xs font-semibold text-slate-400 mb-2">종일</div>
          <div className="space-y-1.5">
            {allDayEvents.map((event) => {
              const config = getCategoryStyle(event.category);
              return (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className={`w-full text-left px-3 py-2 rounded-xl ${config.bg} hover:opacity-80 transition-opacity`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                    <span className={`text-sm font-medium ${config.text}`}>{event.title}</span>
                    {event.visibility === "private" && <Lock size={12} className="text-amber-500" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 시간대별 타임라인 */}
      <div className="max-h-[600px] overflow-y-auto">
        {HOURS.map((hour) => {
          const events = timedEvents.get(hour) ?? [];
          return (
            <div key={hour} className="flex gap-4 border-b border-slate-50">
              <div className="w-14 shrink-0 py-3 text-xs text-slate-400 font-medium tabular-nums text-right">
                {String(hour).padStart(2, "0")}:00
              </div>
              <div className="flex-1 py-2 min-h-[56px]">
                {events.length > 0 ? (
                  <div className="space-y-1.5">
                    {events.map((event) => {
                      const config = getCategoryStyle(event.category);
                      return (
                        <button
                          key={event.id}
                          onClick={() => onEventClick(event)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border-l-3 ${config.bg} hover:shadow-sm transition-shadow`}
                          style={{ borderLeftColor: config.dot.replace("bg-", "") }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${config.badge}`}>
                              {config.label}
                            </span>
                            <span className="text-xs text-slate-400">
                              {formatTime(event.start_time)} - {formatTime(event.end_time)}
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                            {event.title}
                            {event.visibility === "private" && <Lock size={12} className="text-amber-500 shrink-0" />}
                          </div>
                          {event.location && (
                            <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                              {event.location.includes("온라인") || event.location.includes("Zoom") ? (
                                <Monitor size={12} />
                              ) : (
                                <MapPin size={12} />
                              )}
                              {event.location}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
