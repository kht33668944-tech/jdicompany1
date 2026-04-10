"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, SignIn, SignOut } from "phosphor-react";
import { checkIn, checkOut } from "@/lib/attendance/actions";
import { ATTENDANCE_STATUS_CONFIG } from "@/lib/attendance/constants";
import { formatMinutes, formatTime } from "@/lib/utils/date";
import { getErrorMessage } from "@/lib/utils/errors";
import type { AttendanceRecord } from "@/lib/attendance/types";

interface CheckInOutCardProps {
  userId: string;
  todayRecord: AttendanceRecord | null;
  allowedIp: string | null;
}

const ATTENDANCE_STATUSES = Object.keys(ATTENDANCE_STATUS_CONFIG) as AttendanceRecord["status"][];
const ABSENT_STATUS = ATTENDANCE_STATUSES[0];
const WORKING_STATUS = ATTENDANCE_STATUSES[1];

/** 클라이언트 사전 검사 (UX용 빠른 피드백, 실제 차단은 서버 RPC에서 수행) */
async function verifyIpQuick(allowedIp: string | null): Promise<boolean> {
  if (!allowedIp) return true;
  try {
    const res = await fetch("/api/ip");
    const { ip } = await res.json();
    return ip === allowedIp;
  } catch {
    return true; // 사전 검사 실패 시 서버에서 최종 차단
  }
}

export default function CheckInOutCard({ userId, todayRecord, allowedIp }: CheckInOutCardProps) {
  const router = useRouter();
  const [status, setStatus] = useState(todayRecord?.status ?? ABSENT_STATUS);
  const [checkInTime, setCheckInTime] = useState(todayRecord?.check_in ?? null);
  const [checkOutTime, setCheckOutTime] = useState(todayRecord?.check_out ?? null);
  const [elapsed, setElapsed] = useState(formatMinutes(0));
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkOutLoading, setCheckOutLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    setStatus(todayRecord?.status ?? ABSENT_STATUS);
    setCheckInTime(todayRecord?.check_in ?? null);
    setCheckOutTime(todayRecord?.check_out ?? null);
  }, [todayRecord]);

  const calcElapsed = useCallback(() => {
    if (!checkInTime) return formatMinutes(0);
    const start = new Date(checkInTime).getTime();
    const end = checkOutTime ? new Date(checkOutTime).getTime() : Date.now();
    const diffMinutes = Math.max(0, Math.floor((end - start) / 60000));
    return formatMinutes(diffMinutes);
  }, [checkInTime, checkOutTime]);

  useEffect(() => {
    setElapsed(calcElapsed());
    if (status !== WORKING_STATUS) return;
    // 표시는 분 단위 (formatMinutes) — 1초마다 리렌더할 필요 없음. 60초 간격으로 갱신.
    const timer = setInterval(() => setElapsed(calcElapsed()), 60_000);
    return () => clearInterval(timer);
  }, [calcElapsed, status]);

  const handleCheckIn = async () => {
    setCheckInLoading(true);
    setFeedback(null);
    try {
      const ipOk = await verifyIpQuick(allowedIp);
      if (!ipOk) {
        setFeedback({ type: "error", message: "등록된 IP에서만 출근할 수 있습니다. 설정에서 IP를 확인해주세요." });
        return;
      }
      const record = await checkIn(userId);
      setStatus(record.status);
      setCheckInTime(record.check_in);
      setFeedback({ type: "success", message: "출근 처리가 완료되었습니다." });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: getErrorMessage(error, "출근 처리에 실패했습니다.") });
    } finally {
      setCheckInLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setCheckOutLoading(true);
    setFeedback(null);
    try {
      const ipOk = await verifyIpQuick(allowedIp);
      if (!ipOk) {
        setFeedback({ type: "error", message: "등록된 IP에서만 퇴근할 수 있습니다. 설정에서 IP를 확인해주세요." });
        return;
      }
      const record = await checkOut(userId);
      setStatus(record.status);
      setCheckOutTime(record.check_out);
      setFeedback({ type: "success", message: "퇴근 처리가 완료되었습니다." });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: getErrorMessage(error, "퇴근 처리에 실패했습니다.") });
    } finally {
      setCheckOutLoading(false);
    }
  };

  const config = ATTENDANCE_STATUS_CONFIG[status];

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Clock size={20} className="text-slate-400" />
          <h3 className="text-base font-bold text-slate-800">오늘 근무</h3>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
          {status}
        </span>
      </div>

      <div className="text-center py-6">
        <p className="text-4xl font-bold text-slate-800 tabular-nums">{elapsed}</p>
        <div className="flex justify-center gap-6 mt-3 text-sm text-slate-400">
          <span>출근 {formatTime(checkInTime)}</span>
          <span>퇴근 {formatTime(checkOutTime)}</span>
        </div>
      </div>

      {feedback && (
        <div
          className={`mb-4 rounded-xl px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleCheckIn}
          disabled={status !== ABSENT_STATUS || checkInLoading}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-500/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <SignIn size={18} />
          {checkInLoading ? "처리 중..." : "출근하기"}
        </button>
        <button
          onClick={handleCheckOut}
          disabled={status !== WORKING_STATUS || checkOutLoading}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 border border-brand-200 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <SignOut size={18} />
          {checkOutLoading ? "처리 중..." : "퇴근하기"}
        </button>
      </div>
    </div>
  );
}
