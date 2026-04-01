"use client";

import Link from "next/link";
import { CalendarBlank, MapPin } from "phosphor-react";

interface ScheduleItem {
  id: number;
  time: string;
  title: string;
  location?: string;
}

const todaySchedule: ScheduleItem[] = [
  { id: 1, time: "10:00", title: "주간 팀 미팅", location: "회의실 A" },
  { id: 2, time: "14:00", title: "신규 상품 기획 회의" },
  { id: 3, time: "16:30", title: "CS 대응 리뷰", location: "온라인" },
];

export default function ScheduleWidget() {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarBlank size={18} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-500">오늘 일정</h3>
        </div>
        <span className="text-xs font-medium text-slate-400">{todaySchedule.length}개</span>
      </div>

      <ul className="space-y-3">
        {todaySchedule.map((item) => (
          <li key={item.id} className="flex items-start gap-3">
            <span className="shrink-0 bg-brand-50 text-brand-600 rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums mt-0.5">
              {item.time}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{item.title}</p>
              {item.location && (
                <p className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                  <MapPin size={12} />
                  {item.location}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Link
        href="/dashboard/schedule"
        className="flex items-center justify-center gap-1 mt-4 pt-3 border-t border-slate-100 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
      >
        전체 보기
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 256 256">
          <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"/>
        </svg>
      </Link>
    </div>
  );
}
