"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Clock, CheckSquare, CalendarBlank, ChartBar } from "phosphor-react";
import { checkIn, checkOut } from "@/lib/attendance/actions";

interface Props {
  userId: string;
  attendanceStatus: "미출근" | "근무중" | "퇴근";
  checkInTime: string | null;
  checkOutTime: string | null;
  taskTotal: number;
  taskCompleted: number;
  urgentCount: number;
  highCount: number;
  todayScheduleCount: number;
  nextScheduleMinutes: number | null;
  weeklyMinutes: number;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function computeElapsedFromCheckIn(checkInTime: string): string {
  const diffSec = Math.floor((Date.now() - new Date(checkInTime).getTime()) / 1000);
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  return `${h}h ${m}m`;
}

function computeStaticElapsed(checkInTime: string, checkOutTime: string): string {
  const diffSec = Math.floor(
    (new Date(checkOutTime).getTime() - new Date(checkInTime).getTime()) / 1000
  );
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  return `${h}h ${m}m`;
}

// Returns index 0=Mon … 4=Fri for the current day, or -1 if weekend
function getTodayWeekdayIndex(): number {
  const day = new Date().getDay(); // 0=Sun,1=Mon,...,6=Sat
  if (day === 0 || day === 6) return -1;
  return day - 1;
}

export default function QuickStatsWidget({
  userId,
  attendanceStatus,
  checkInTime,
  checkOutTime,
  taskTotal,
  taskCompleted,
  urgentCount,
  highCount,
  todayScheduleCount,
  nextScheduleMinutes,
  weeklyMinutes,
}: Props) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState<string>("0h 0m");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateElapsed = useCallback(() => {
    if (attendanceStatus === "근무중" && checkInTime) {
      setElapsed(computeElapsedFromCheckIn(checkInTime));
    } else if (attendanceStatus === "퇴근" && checkInTime && checkOutTime) {
      setElapsed(computeStaticElapsed(checkInTime, checkOutTime));
    } else {
      setElapsed("0h 0m");
    }
  }, [attendanceStatus, checkInTime, checkOutTime]);

  useEffect(() => {
    updateElapsed();
    if (attendanceStatus !== "근무중" || !checkInTime) return;
    const timer = setInterval(updateElapsed, 60_000);
    return () => clearInterval(timer);
  }, [attendanceStatus, checkInTime, updateElapsed]);

  const handleAttendance = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSubmitting || attendanceStatus === "퇴근") return;
    setIsSubmitting(true);
    try {
      if (attendanceStatus === "미출근") {
        await checkIn(userId);
      } else {
        await checkOut(userId);
      }
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const percentage = taskTotal > 0 ? Math.round((taskCompleted / taskTotal) * 100) : 0;
  const circumference = 100;
  const dashOffset = circumference - percentage;

  const todayIndex = getTodayWeekdayIndex();
  const weekdayLabels = ["월", "화", "수", "목", "금"];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* Card 1 — 근무 상태 → 근태관리 페이지 */}
      <div
        onClick={() => router.push("/dashboard/attendance")}
        className="bg-white p-3.5 sm:p-4 rounded-2xl shadow-sm flex flex-col cursor-pointer hover:shadow-md transition-shadow"
      >
        {/* Top row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Clock size={18} />
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              attendanceStatus === "근무중"
                ? "bg-emerald-50 text-emerald-600"
                : attendanceStatus === "퇴근"
                ? "bg-blue-50 text-blue-600"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {attendanceStatus}
          </span>
        </div>

        {/* Elapsed time */}
        <p className="text-xl sm:text-2xl font-bold mb-0.5 tabular-nums">{elapsed}</p>
        <p className="text-xs text-slate-400 mb-2.5">오늘 누적 근무시간</p>

        {/* Action button */}
        {attendanceStatus === "미출근" && (
          <button
            onClick={handleAttendance}
            disabled={isSubmitting}
            className="w-full py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors mt-auto disabled:opacity-60"
          >
            출근하기
          </button>
        )}
        {attendanceStatus === "근무중" && (
          <button
            onClick={handleAttendance}
            disabled={isSubmitting}
            className="w-full py-2 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors mt-auto disabled:opacity-60"
          >
            퇴근하기
          </button>
        )}
        {attendanceStatus === "퇴근" && (
          <button
            disabled
            className="w-full py-2 bg-slate-50 text-slate-400 rounded-lg text-xs font-bold mt-auto cursor-not-allowed"
          >
            퇴근 완료
          </button>
        )}
      </div>

      {/* Card 2 — 할일 진행률 → 할일 페이지 */}
      <div
        onClick={() => router.push("/dashboard/tasks")}
        className="bg-white p-3.5 sm:p-4 rounded-2xl shadow-sm flex flex-col cursor-pointer hover:shadow-md transition-shadow"
      >
        {/* Top row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="w-9 h-9 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <CheckSquare size={18} />
          </div>
          {/* Circular SVG progress */}
          <div className="relative w-8 h-8">
            <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
              <circle
                cx="18"
                cy="18"
                r="15.9"
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="3"
                strokeDasharray="100"
                strokeDashoffset="0"
                pathLength="100"
              />
              <circle
                cx="18"
                cy="18"
                r="15.9"
                fill="none"
                stroke="#a855f7"
                strokeWidth="3"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={`${dashOffset}`}
                pathLength="100"
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-purple-600">
              {percentage}%
            </span>
          </div>
        </div>

        <p className="text-xl sm:text-2xl font-bold mb-0.5">
          {taskCompleted}/{taskTotal}
        </p>
        <p className="text-xs text-slate-400 mb-1.5">완료한 할일</p>

        {/* Priority badges */}
        <div className="flex items-center gap-1.5 mt-auto">
          {urgentCount > 0 && (
            <span className="px-1.5 py-0.5 bg-red-50 text-red-500 text-[10px] font-bold rounded">
              긴급 {urgentCount}
            </span>
          )}
          {highCount > 0 && (
            <span className="px-1.5 py-0.5 bg-orange-50 text-orange-500 text-[10px] font-bold rounded">
              높음 {highCount}
            </span>
          )}
        </div>
      </div>

      {/* Card 3 — 오늘 일정 → 스케줄 페이지 */}
      <div
        onClick={() => router.push("/dashboard/schedule")}
        className="bg-white p-3.5 sm:p-4 rounded-2xl shadow-sm flex flex-col cursor-pointer hover:shadow-md transition-shadow"
      >
        {/* Top row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <CalendarBlank size={18} />
          </div>
        </div>

        <p className="text-xl sm:text-2xl font-bold mb-0.5">{todayScheduleCount}개</p>
        <p className="text-xs text-slate-400 mb-2.5">오늘 일정</p>

        {/* Next schedule */}
        <div className="mt-auto">
          {nextScheduleMinutes !== null ? (
            <div className="flex items-center gap-1.5 text-xs font-bold text-orange-500">
              <Clock size={14} />
              <span>다음 일정 {nextScheduleMinutes}분 후</span>
            </div>
          ) : (
            <p className="text-xs text-slate-400">일정 없음</p>
          )}
        </div>
      </div>

      {/* Card 4 — 이번 주 근무 → 근태관리 페이지 */}
      <div
        onClick={() => router.push("/dashboard/attendance")}
        className="bg-white p-3.5 sm:p-4 rounded-2xl shadow-sm flex flex-col cursor-pointer hover:shadow-md transition-shadow"
      >
        {/* Top row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <ChartBar size={18} />
          </div>
        </div>

        <p className="text-xl sm:text-2xl font-bold mb-0.5 tabular-nums">{formatMinutes(weeklyMinutes)}</p>
        <p className="text-xs text-slate-400 mb-2.5">이번 주 누적</p>

        {/* Weekday bars — 오늘까지 채움, 오늘=indigo, 과거=emerald, 미래=비움 */}
        <div className="mt-auto">
          <div className="flex gap-1">
            {weekdayLabels.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i === todayIndex
                    ? "bg-indigo-400"
                    : i < todayIndex
                    ? "bg-emerald-400"
                    : "bg-slate-100"
                }`}
              />
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            {weekdayLabels.map((label, i) => (
              <span key={i} className={i === todayIndex ? "font-bold text-indigo-500" : ""}>
                {label}
              </span>
            ))}
            {todayIndex >= 0 && (
              <span className="text-slate-400"> · 오늘</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
