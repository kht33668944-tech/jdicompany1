"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ClockCounterClockwise, Plus } from "phosphor-react";
import AttendanceCalendar from "../AttendanceCalendar";
import AttendanceTable from "../AttendanceTable";
import CorrectionRequestModal from "../CorrectionRequestModal";
import { formatDate, formatTime } from "@/lib/utils/date";
import type { AttendanceRecord, CorrectionRequest } from "@/lib/attendance/types";

const CORRECTION_STATUS_STYLE: Record<string, string> = {
  "대기중": "bg-amber-50 text-amber-600",
  "승인": "bg-emerald-50 text-emerald-600",
  "반려": "bg-red-50 text-red-600",
};

interface RecordsTabProps {
  userId: string;
  monthRecords: AttendanceRecord[];
  correctionRequests: CorrectionRequest[];
  currentYear: number;
  currentMonth: number;
}

export default function RecordsTab({ userId, monthRecords, correctionRequests, currentYear, currentMonth }: RecordsTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [showMissingModal, setShowMissingModal] = useState(false);

  const STORAGE_KEY = `dismissed-corrections-${userId}`;
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, [STORAGE_KEY]);

  const visibleRequests = correctionRequests.filter((req) =>
    req.status === "대기중" || !dismissedIds.has(req.id)
  );

  const handleMonthChange = (year: number, month: number) => {
    setSelectedRecord(null);
    router.replace(`${pathname}?year=${year}&month=${month}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setShowMissingModal(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 border border-brand-200 transition-colors"
        >
          <Plus size={16} weight="bold" />
          기록 누락 신청
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AttendanceTable
            records={monthRecords}
            onRequestCorrection={(record) => setSelectedRecord(record)}
          />
        </div>
        <div className="space-y-6">
          <AttendanceCalendar
            records={monthRecords}
            year={currentYear}
            month={currentMonth}
            onMonthChange={handleMonthChange}
          />

          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <ClockCounterClockwise size={18} className="text-slate-400" />
              <h4 className="text-sm font-bold text-slate-800">정정 요청 이력</h4>
            </div>
            {visibleRequests.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-3">정정 요청 이력이 없습니다.</p>
            ) : (
              <ul className="space-y-2.5">
                {visibleRequests.map((req) => (
                  <li key={req.id} className="rounded-xl bg-slate-50/50 border border-slate-100 px-3.5 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-700">{formatDate(req.target_date)}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CORRECTION_STATUS_STYLE[req.status] ?? ""}`}>
                        {req.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-1">{req.request_type}</p>
                    <div className="flex gap-3 text-[11px] text-slate-400">
                      {req.requested_check_in && <span>출근 {formatTime(req.requested_check_in)}</span>}
                      {req.requested_check_out && <span>퇴근 {formatTime(req.requested_check_out)}</span>}
                    </div>
                    {req.reason && <p className="text-[11px] text-slate-400 mt-1 truncate">사유: {req.reason}</p>}
                    {req.status !== "대기중" && (
                      <button
                        onClick={() => handleDismiss(req.id)}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <Check size={12} />
                        확인
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {selectedRecord && (
        <CorrectionRequestModal
          userId={userId}
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}

      {showMissingModal && (
        <CorrectionRequestModal
          userId={userId}
          onClose={() => setShowMissingModal(false)}
        />
      )}
    </div>
  );
}
