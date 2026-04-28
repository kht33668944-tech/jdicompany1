"use client";

import { ChartBar } from "phosphor-react";
import { formatMinutes, toDateString } from "@/lib/utils/date";
import type { AttendanceRecord, WorkSchedule } from "@/lib/attendance/types";

interface WeekSummaryCardProps {
  weekRecords: AttendanceRecord[];
  weekStart: string;
  workSchedules: WorkSchedule[];
}

const WEEKDAYS = ["월", "화", "수", "목", "금"];

export default function WeekSummaryCard({ weekRecords, weekStart }: WeekSummaryCardProps) {
  // SSR(UTC) vs CSR(KST) hydration mismatch 방지 — KST 정오 기준으로 고정
  const startDate = new Date(`${weekStart}T12:00:00+09:00`);
  const todayStr = toDateString();
  const days = WEEKDAYS.map((label, i) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = toDateString(d);
    const record = weekRecords.find((r) => r.work_date === dateStr);
    return { label, date: dateStr, record };
  });

  const totalMinutes = weekRecords.reduce((sum, r) => sum + (r.total_minutes ?? 0), 0);
  const maxMinutes = 9 * 60;

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ChartBar size={20} className="text-slate-400" />
          <h3 className="text-base font-bold text-slate-800">이번 주 근무</h3>
        </div>
        <span className="text-sm font-semibold text-brand-600">{formatMinutes(totalMinutes)}</span>
      </div>

      <div className="space-y-3">
        {days.map((day) => {
          const minutes = day.record?.total_minutes ?? 0;
          const isToday = day.date === todayStr;
          const width = minutes > 0 ? Math.min((minutes / maxMinutes) * 100, 100) : 0;

          return (
            <div key={day.date} className="flex items-center gap-3">
              <span className={`text-xs font-semibold w-4 ${isToday ? "text-brand-600" : "text-slate-400"}`}>
                {day.label}
              </span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                {width > 0 && (
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isToday
                        ? "bg-gradient-to-r from-brand-500 to-indigo-500"
                        : "bg-slate-300"
                    }`}
                    style={{ width: `${width}%` }}
                  />
                )}
              </div>
              <span className="text-xs text-slate-400 w-16 text-right tabular-nums">
                {minutes > 0 ? formatMinutes(minutes) : "--"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
