"use client";

import { CaretLeft, CaretRight } from "phosphor-react";
import { ATTENDANCE_STATUS_CONFIG } from "@/lib/attendance/constants";
import { getDaysInMonth, getFirstDayOfMonth, isWeekend, toDateString } from "@/lib/utils/date";
import type { AttendanceRecord } from "@/lib/attendance/types";

interface AttendanceCalendarProps {
  records: AttendanceRecord[];
  year: number;
  month: number;
  onMonthChange?: (year: number, month: number) => void;
}

const DAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"];
const ATTENDANCE_STATUSES = Object.keys(ATTENDANCE_STATUS_CONFIG) as AttendanceRecord["status"][];

export default function AttendanceCalendar({ records, year, month, onMonthChange }: AttendanceCalendarProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayStr = toDateString();
  const recordMap = new Map(records.map((record) => [record.work_date, record]));

  const prevMonth = () => {
    const nextMonth = month === 1 ? 12 : month - 1;
    const nextYear = month === 1 ? year - 1 : year;
    onMonthChange?.(nextYear, nextMonth);
  };

  const nextMonth = () => {
    const updatedMonth = month === 12 ? 1 : month + 1;
    const updatedYear = month === 12 ? year + 1 : year;
    onMonthChange?.(updatedYear, updatedMonth);
  };

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <CaretLeft size={18} />
        </button>
        <h3 className="text-base font-bold text-slate-800">
          {year}년 {month}월
        </h3>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <CaretRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAY_HEADERS.map((day) => (
          <div key={day} className="text-center text-xs font-semibold text-slate-400 py-1">
            {day}
          </div>
        ))}

        {Array.from({ length: firstDay }).map((_, index) => (
          <div key={`empty-${index}`} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const record = recordMap.get(dateStr);
          const weekend = isWeekend(dateStr);
          const isToday = dateStr === todayStr;
          const isFuture = dateStr > todayStr;
          const checkedOutStatus = ATTENDANCE_STATUSES[2];
          const workingStatus = ATTENDANCE_STATUSES[1];

          let dotColor = "";
          let label = "기록 없음";

          if (record?.status === checkedOutStatus) {
            dotColor = "bg-emerald-500";
            label = "정상 퇴근";
          } else if (record?.status === workingStatus) {
            dotColor = "bg-brand-500";
            label = "근무 중";
          } else if (!weekend && !isFuture && dateStr < todayStr) {
            dotColor = "bg-slate-300";
            label = "기록 없음 또는 결근";
          }

          return (
            <button
              key={day}
              type="button"
              title={`${dateStr} - ${label}`}
              className={`relative flex flex-col items-center py-1.5 rounded-lg text-xs ${
                isToday ? "bg-brand-50 font-bold text-brand-600" : weekend ? "text-slate-300" : "text-slate-600"
              }`}
            >
              {day}
              {dotColor && <span className={`mt-0.5 h-1 w-1 rounded-full ${dotColor}`} />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> 정상 퇴근
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-brand-500" /> 근무 중
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-slate-300" /> 기록 없음
        </div>
      </div>
    </div>
  );
}
