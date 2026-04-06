"use client";

import type { AttendanceStats } from "@/lib/attendance/stats";
import { minutesToTimeLabel } from "@/lib/attendance/stats";

interface EmployeeCardProps {
  name: string;
  department: string;
  stats: AttendanceStats;
  selected: boolean;
  onClick: () => void;
  avatarColor: string;
}

const AVATAR_COLORS = [
  "bg-red-100 text-red-600",
  "bg-blue-100 text-blue-600",
  "bg-green-100 text-green-600",
  "bg-purple-100 text-purple-600",
  "bg-amber-100 text-amber-600",
  "bg-pink-100 text-pink-600",
  "bg-teal-100 text-teal-600",
];

export function getAvatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export default function EmployeeCard({
  name,
  department,
  stats,
  selected,
  onClick,
  avatarColor,
}: EmployeeCardProps) {
  const initial = name.charAt(0);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl p-4 transition-all duration-200 ${
        selected
          ? "bg-white border-2 border-brand-500 shadow-md"
          : "bg-white/60 border border-slate-100 hover:bg-white hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor}`}>
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div>
              <span className="text-sm font-bold text-slate-800">{name}</span>
              <p className="text-xs text-slate-400">{department}</p>
            </div>
            <div className="flex gap-1 flex-wrap justify-end">
              {stats.normalCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-50 text-brand-600">
                  정상 {stats.normalCount}
                </span>
              )}
              {stats.lateCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-600">
                  지각 {stats.lateCount}
                </span>
              )}
              {stats.earlyLeaveCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-600">
                  조퇴 {stats.earlyLeaveCount}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-6 mt-2 text-xs text-slate-500">
            <div>
              <span className="text-slate-400">평균 출근</span>
              <p className="font-semibold text-slate-700">
                {stats.totalDays > 0 ? minutesToTimeLabel(stats.avgCheckInMinutes) : "--:--"}
              </p>
            </div>
            <div>
              <span className="text-slate-400">평균 퇴근</span>
              <p className="font-semibold text-slate-700">
                {stats.totalDays > 0 ? minutesToTimeLabel(stats.avgCheckOutMinutes) : "--:--"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
