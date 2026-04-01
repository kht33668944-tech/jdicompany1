"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, SignIn, SignOut } from "phosphor-react";

type AttendanceStatus = "미출근" | "근무중" | "퇴근";

export default function AttendanceWidget() {
  const [status, setStatus] = useState<AttendanceStatus>("미출근");
  const [checkInTime, setCheckInTime] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState("0시간 0분");

  const formatElapsed = useCallback((start: Date) => {
    const diff = Math.floor((Date.now() - start.getTime()) / 1000);
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    return `${hours}시간 ${minutes}분`;
  }, []);

  useEffect(() => {
    if (status !== "근무중" || !checkInTime) return;
    const timer = setInterval(() => {
      setElapsed(formatElapsed(checkInTime));
    }, 1000);
    return () => clearInterval(timer);
  }, [status, checkInTime, formatElapsed]);

  const handleCheckIn = () => {
    const now = new Date();
    setCheckInTime(now);
    setStatus("근무중");
    setElapsed("0시간 0분");
  };

  const handleCheckOut = () => {
    setStatus("퇴근");
  };

  const statusConfig = {
    "미출근": { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
    "근무중": { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500" },
    "퇴근": { bg: "bg-brand-50", text: "text-brand-600", dot: "bg-brand-500" },
  };

  const config = statusConfig[status];

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-500">근태관리</h3>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
          {status}
        </span>
      </div>

      <div className="text-center py-4">
        <p className="text-3xl font-bold text-slate-800 tabular-nums">{elapsed}</p>
        <p className="text-xs text-slate-400 mt-1">
          {checkInTime
            ? `출근: ${checkInTime.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}`
            : "오늘 아직 출근 전입니다"}
        </p>
      </div>

      <div className="flex gap-2 mt-2">
        <button
          onClick={handleCheckIn}
          disabled={status !== "미출근"}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-md shadow-brand-500/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <SignIn size={16} />
          출근
        </button>
        <button
          onClick={handleCheckOut}
          disabled={status !== "근무중"}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 border border-brand-200 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <SignOut size={16} />
          퇴근
        </button>
      </div>
    </div>
  );
}
