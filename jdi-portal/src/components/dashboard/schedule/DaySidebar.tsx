"use client";

import { useMemo } from "react";
import { MapPin, Monitor, CalendarBlank, Lock, Clock } from "phosphor-react";
import { formatTime, toDateStringFromTimestamp } from "@/lib/utils/date";
import { getCategoryStyle } from "@/lib/schedule/constants";
import type { ScheduleWithProfile } from "@/lib/schedule/types";

interface DaySidebarProps {
  schedules: ScheduleWithProfile[];
  selectedDate: string;
  onEventClick: (schedule: ScheduleWithProfile) => void;
}

function formatDateHeader(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00+09:00`);
  return date.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  });
}

function getDurationMinutes(startTime: string, endTime: string): number {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return Math.round((end - start) / 60000);
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  }
  return `${minutes}분`;
}

export default function DaySidebar({ schedules, selectedDate, onEventClick }: DaySidebarProps) {
  const daySchedules = useMemo(() => {
    return schedules
      .filter((s) => {
        const start = toDateStringFromTimestamp(s.start_time);
        const end = toDateStringFromTimestamp(s.end_time);
        return selectedDate >= start && selectedDate <= end;
      })
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [schedules, selectedDate]);

  return (
    <div className="glass-card rounded-2xl p-6">
      {/* 헤더 */}
      <div className="mb-6">
        <h3 className="text-xl font-bold text-slate-900">{formatDateHeader(selectedDate)} 일정</h3>
        <p className="text-sm text-slate-400 mt-1">
          {daySchedules.length > 0
            ? `오늘 등록된 일정이 ${daySchedules.length}개 있습니다.`
            : "이 날짜에 예정된 일정이 없습니다."}
        </p>
      </div>

      {/* 타임라인 일정 목록 */}
      {daySchedules.length > 0 ? (
        <div className="relative">
          {/* 타임라인 세로선 */}
          <div className="absolute left-[52px] top-0 bottom-0 w-px bg-slate-100" />

          <div className="space-y-6">
            {daySchedules.map((schedule) => {
              const config = getCategoryStyle(schedule.category);
              const duration = schedule.is_all_day
                ? null
                : getDurationMinutes(schedule.start_time, schedule.end_time);

              return (
                <button
                  key={schedule.id}
                  type="button"
                  onClick={() => onEventClick(schedule)}
                  className="w-full text-left group"
                >
                  <div className="flex gap-4">
                    {/* 시간 */}
                    <div className="w-[40px] shrink-0 pt-1">
                      <span className="text-sm font-bold text-slate-700 tabular-nums">
                        {schedule.is_all_day ? "종일" : formatTime(schedule.start_time)}
                      </span>
                    </div>

                    {/* 타임라인 도트 */}
                    <div className="relative shrink-0 flex items-start pt-2">
                      <span className={`w-3 h-3 rounded-full ${config.dot} ring-4 ring-white z-10`} />
                    </div>

                    {/* 이벤트 카드 */}
                    <div className={`flex-1 rounded-xl p-4 shadow-sm group-hover:shadow-md transition-all ${config.bg}`}>
                      {/* 카테고리 + 개인 뱃지 */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                        <span className={`text-xs font-semibold ${config.text}`}>
                          {config.labelKo}
                        </span>
                        {schedule.visibility === "private" && (
                          <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-600">
                            <Lock size={10} />
                            개인
                          </span>
                        )}
                      </div>

                      {/* 제목 */}
                      <h4 className="text-base font-bold text-slate-800 mb-2 leading-snug">
                        {schedule.title}
                      </h4>

                      {/* 장소 + 소요시간 */}
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        {schedule.location && (
                          <span className="flex items-center gap-1">
                            {schedule.location.includes("온라인") || schedule.location.includes("Zoom") ? (
                              <Monitor size={13} />
                            ) : (
                              <MapPin size={13} />
                            )}
                            {schedule.location}
                          </span>
                        )}
                        {duration && (
                          <span className="flex items-center gap-1">
                            <Clock size={13} />
                            {formatDuration(duration)}
                          </span>
                        )}
                      </div>

                      {/* 참여자 */}
                      {schedule.schedule_participants && schedule.schedule_participants.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {schedule.schedule_participants.map((p) => (
                            <span
                              key={p.id}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-600"
                            >
                              {p.profiles.full_name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-slate-300">
          <CalendarBlank size={48} />
          <p className="text-sm mt-3">일정 없음</p>
        </div>
      )}
    </div>
  );
}
