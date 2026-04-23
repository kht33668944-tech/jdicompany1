"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check, Clock, CalendarBlank } from "phosphor-react";
import type { ScheduleWithProfile } from "@/lib/schedule/types";
import { formatTime } from "@/lib/utils/date";

interface Props {
  schedules: ScheduleWithProfile[];
}

type Status = "completed" | "current" | "upcoming";

function getStatus(startTime: string, endTime: string, now: Date): Status {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (now > end) return "completed";
  if (now >= start && now <= end) return "current";
  return "upcoming";
}


export default function TodayScheduleWidget({ schedules }: Props) {
  // 서버(싱가포르)와 브라우저(한국) 시각차로 hydration mismatch가 발생하지 않도록
  // 마운트 전에는 null, 마운트 후에만 실제 시각을 사용
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-white rounded-[24px] shadow-sm p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-slate-800">오늘 일정</h3>
          <p className="text-xs text-slate-400 mt-1">타임라인 뷰</p>
        </div>
        <Link
          href="/dashboard/schedule"
          className="text-sm font-bold text-indigo-600 hover:underline"
        >
          캘린더
        </Link>
      </div>

      {/* Timeline */}
      {schedules.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">오늘 일정이 없습니다</p>
      ) : (
        <div className="relative space-y-6">
          {/* Vertical line */}
          <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-100" />

          {schedules.map((schedule) => {
            const status: Status = (schedule.is_all_day || !now)
              ? "upcoming"
              : getStatus(schedule.start_time, schedule.end_time, now);

            const circleClass =
              status === "completed"
                ? "bg-emerald-100 text-emerald-600"
                : status === "current"
                ? "bg-indigo-500 text-white ring-4 ring-indigo-100"
                : "bg-slate-100 text-slate-400";

            const timeClass =
              status === "current" ? "text-indigo-500" : "text-slate-400";

            const titleClass =
              status === "completed"
                ? "text-slate-500 line-through"
                : status === "current"
                ? "text-slate-800"
                : "text-slate-600";

            return (
              <div key={schedule.id} className="flex items-start gap-4 relative">
                {/* Circle */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${circleClass}`}
                >
                  {status === "completed" && <Check size={14} weight="bold" />}
                  {status === "current" && <Clock size={14} weight="bold" />}
                  {status === "upcoming" && <CalendarBlank size={14} />}
                </div>

                {/* Content */}
                <div className="flex-1 pt-1">
                  <p className={`text-xs font-bold ${timeClass}`}>
                    {schedule.is_all_day
                      ? "종일"
                      : `${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}`}
                  </p>
                  <p className={`font-bold ${titleClass}`}>{schedule.title}</p>
                  {schedule.location && (
                    <p className="text-xs text-slate-400 mt-1">{schedule.location}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
