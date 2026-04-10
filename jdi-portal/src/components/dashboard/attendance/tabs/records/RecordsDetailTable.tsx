"use client";

import { useState } from "react";
import { DownloadSimple, PencilSimple, Plus } from "phosphor-react";
import { formatDate, formatTime, formatMinutes } from "@/lib/utils/date";
import { timeStringToMinutes, getScheduleForDate } from "@/lib/attendance/stats";
import type { AttendanceRecord, WorkSchedule } from "@/lib/attendance/types";
import CorrectionRequestModal from "../../CorrectionRequestModal";

interface RecordsDetailTableProps {
  records: AttendanceRecord[];
  employeeName: string;
  periodLabel: string;
  workSchedules: WorkSchedule[];
  isOwnRecord: boolean;
}

function getRecordStatus(record: AttendanceRecord, workSchedules: WorkSchedule[]): { label: string; color: string } {
  if (!record.check_in) return { label: "미출근", color: "bg-slate-100 text-slate-600" };

  const { workStart } = getScheduleForDate(workSchedules, record.work_date);
  const workStartMinutes = timeStringToMinutes(workStart);

  const date = new Date(record.check_in);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const checkInMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  if (checkInMin > workStartMinutes) {
    return { label: "지각", color: "bg-red-50 text-red-600" };
  }
  return { label: "정상", color: "bg-brand-50 text-brand-600" };
}

export default function RecordsDetailTable({
  records,
  employeeName,
  periodLabel,
  workSchedules,
  isOwnRecord,
}: RecordsDetailTableProps) {
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [showMissingModal, setShowMissingModal] = useState(false);

  const handleExcelDownload = async () => {
    const XLSX = await import("xlsx");
    const data = records.map((record) => {
      const status = getRecordStatus(record, workSchedules);
      return {
        "날짜": record.work_date,
        "출근 시간": formatTime(record.check_in),
        "퇴근 시간": formatTime(record.check_out),
        "근무 시간": formatMinutes(record.total_minutes),
        "상태": status.label,
        "비고": record.note ?? "-",
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "근태기록");
    XLSX.writeFile(wb, `${employeeName}_근태기록_${periodLabel.replace(/\s/g, "")}.xlsx`);
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-slate-800">
          {employeeName}님의 상세 기록 <span className="text-slate-400 font-normal">{periodLabel}</span>
        </h4>
        <div className="flex items-center gap-2">
          {isOwnRecord && (
            <button
              onClick={() => setShowMissingModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 border border-brand-200 transition-colors"
            >
              <Plus size={14} weight="bold" />
              기록 누락 신청
            </button>
          )}
          <button
            onClick={handleExcelDownload}
            disabled={records.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <DownloadSimple size={14} />
            엑셀 다운로드
          </button>
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto overflow-x-auto rounded-xl">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">날짜</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">출근 시간</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">퇴근 시간</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">근무 시간</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">상태</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">비고</th>
              {isOwnRecord && <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.length === 0 ? (
              <tr>
                <td colSpan={isOwnRecord ? 7 : 6} className="text-center py-8 text-sm text-slate-400">
                  해당 기간의 기록이 없습니다.
                </td>
              </tr>
            ) : (
              records.map((record) => {
                const status = getRecordStatus(record, workSchedules);
                return (
                  <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDate(record.work_date)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatTime(record.check_in)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatTime(record.check_out)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatMinutes(record.total_minutes)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px] truncate">{record.note ?? "-"}</td>
                    {isOwnRecord && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedRecord(record)}
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap px-2 py-2 rounded-lg hover:bg-brand-50 transition-colors"
                        >
                          <PencilSimple size={14} />
                          수정 요청
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedRecord && (
        <CorrectionRequestModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}

      {showMissingModal && (
        <CorrectionRequestModal
          onClose={() => setShowMissingModal(false)}
        />
      )}
    </div>
  );
}
