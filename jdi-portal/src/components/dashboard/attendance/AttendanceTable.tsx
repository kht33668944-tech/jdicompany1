"use client";

import { formatTime, formatMinutes, formatDate } from "@/lib/utils/date";
import { ATTENDANCE_STATUS_CONFIG } from "@/lib/attendance/constants";
import type { AttendanceRecord } from "@/lib/attendance/types";

interface AttendanceTableProps {
  records: AttendanceRecord[];
  onRequestCorrection?: (record: AttendanceRecord) => void;
}

export default function AttendanceTable({ records, onRequestCorrection }: AttendanceTableProps) {
  if (records.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <p className="text-slate-400 text-sm">이번 달 출퇴근 기록이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200/50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">날짜</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">출근</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">퇴근</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">근무시간</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">상태</th>
              {onRequestCorrection && (
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase"></th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((record) => {
              const sc = ATTENDANCE_STATUS_CONFIG[record.status];
              const statusColors = `${sc.bg} ${sc.text}` as const;
              return (
                <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-700">{formatDate(record.work_date)}</td>
                  <td className="px-6 py-3 text-slate-600 tabular-nums">{formatTime(record.check_in)}</td>
                  <td className="px-6 py-3 text-slate-600 tabular-nums">{formatTime(record.check_out)}</td>
                  <td className="px-6 py-3 text-slate-600">{formatMinutes(record.total_minutes)}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors}`}>
                      {record.status}
                    </span>
                  </td>
                  {onRequestCorrection && (
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => onRequestCorrection(record)}
                        className="text-xs text-slate-400 hover:text-brand-600 transition-colors"
                      >
                        수정 요청
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
