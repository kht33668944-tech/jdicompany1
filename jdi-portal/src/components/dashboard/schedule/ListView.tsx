"use client";

import { useMemo } from "react";
import { MapPin, Monitor, CalendarBlank, Lock } from "phosphor-react";
import { formatTime, toDateStringFromTimestamp } from "@/lib/utils/date";
import { getCategoryStyle } from "@/lib/schedule/constants";
import type { ScheduleWithProfile } from "@/lib/schedule/types";

interface ListViewProps {
  schedules: ScheduleWithProfile[];
  onEventClick: (schedule: ScheduleWithProfile) => void;
}

function formatGroupDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00+09:00`).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

interface DateGroup {
  date: string;
  label: string;
  events: ScheduleWithProfile[];
}

export default function ListView({ schedules, onEventClick }: ListViewProps) {
  const groups = useMemo(() => {
    const map = new Map<string, ScheduleWithProfile[]>();

    // 모든 일정을 시작 날짜별로 그룹화
    for (const schedule of schedules) {
      const dateStr = toDateStringFromTimestamp(schedule.start_time);
      const arr = map.get(dateStr) ?? [];
      arr.push(schedule);
      map.set(dateStr, arr);
    }

    // 날짜순 정렬
    const sorted: DateGroup[] = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, events]) => ({
        date,
        label: formatGroupDate(date),
        events: events.sort((a, b) => a.start_time.localeCompare(b.start_time)),
      }));

    return sorted;
  }, [schedules]);

  if (groups.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center">
        <CalendarBlank size={48} className="mx-auto text-slate-300 mb-3" />
        <p className="text-sm text-slate-400">이번 달에 등록된 일정이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.date} className="glass-card rounded-2xl p-5">
          {/* 날짜 헤더 */}
          <div className="flex items-center gap-2 mb-4">
            <CalendarBlank size={16} className="text-brand-500" />
            <h4 className="text-sm font-bold text-slate-700">{group.label}</h4>
            <span className="text-xs text-slate-400">{group.events.length}개</span>
          </div>

          {/* 일정 목록 */}
          <div className="space-y-2">
            {group.events.map((event) => {
              const config = getCategoryStyle(event.category);
              return (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="w-full text-left flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  {/* 시간 */}
                  <div className="shrink-0 w-20 text-right">
                    {event.is_all_day ? (
                      <span className="text-xs font-medium text-slate-400">종일</span>
                    ) : (
                      <div className="text-xs tabular-nums">
                        <div className="font-semibold text-slate-700">
                          {formatTime(event.start_time)}
                        </div>
                        <div className="text-slate-400">
                          {formatTime(event.end_time)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 컬러 바 */}
                  <div className={`w-1 self-stretch rounded-full ${config.dot}`} />

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${config.badge}`}>
                        {config.label}
                      </span>
                    </div>
                    <h5 className="text-sm font-semibold text-slate-700 truncate flex items-center gap-1">
                      {event.visibility === "private" && <Lock size={12} className="text-amber-500 shrink-0" />}
                      {event.title}
                    </h5>
                    {event.location && (
                      <p className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                        {event.location.includes("온라인") || event.location.includes("Zoom") ? (
                          <Monitor size={12} />
                        ) : (
                          <MapPin size={12} />
                        )}
                        {event.location}
                      </p>
                    )}
                  </div>

                  {/* 작성자 */}
                  <div className="shrink-0 text-xs text-slate-400">
                    {event.creator_profile.full_name}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
