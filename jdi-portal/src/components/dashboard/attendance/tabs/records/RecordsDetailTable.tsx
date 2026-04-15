"use client";

import { useMemo, useState } from "react";
import { DownloadSimple, PencilSimple, Plus } from "phosphor-react";
import { formatDate, formatTime, formatMinutes, formatSignedMinutes } from "@/lib/utils/date";
import {
  timeStringToMinutes,
  getScheduleForDate,
  calcDayActualMinutes,
  calcDayStandardMinutes,
  type VacationByDate,
} from "@/lib/attendance/stats";
import type { AttendanceRecord, WorkSchedule, VacationType } from "@/lib/attendance/types";
import CorrectionRequestModal from "../../CorrectionRequestModal";

interface RecordsDetailTableProps {
  records: AttendanceRecord[];
  employeeName: string;
  periodLabel: string;
  workSchedules: WorkSchedule[];
  isOwnRecord: boolean;
  vacationsByDate: VacationByDate;
  rangeStart: string;
  rangeEnd: string;
}

interface DisplayRow {
  workDate: string;
  record: AttendanceRecord | null;
  vacationType: VacationType | null;
}

function getRecordStatus(
  record: AttendanceRecord | null,
  vacationType: VacationType | null,
  workSchedules: WorkSchedule[],
  workDate: string
): { label: string; color: string } {
  if (vacationType && !record) {
    return { label: vacationType, color: "bg-purple-50 text-purple-600" };
  }
  if (!record || !record.check_in) {
    return { label: "미출근", color: "bg-slate-100 text-slate-600" };
  }

  const { workStart } = getScheduleForDate(workSchedules, workDate);
  const workStartMinutes = timeStringToMinutes(workStart);

  const date = new Date(record.check_in);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const checkInMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  if (checkInMin > workStartMinutes) {
    return { label: "지각", color: "bg-red-50 text-red-600" };
  }
  if (vacationType === "반차-오전" || vacationType === "반차-오후") {
    return { label: vacationType, color: "bg-purple-50 text-purple-600" };
  }
  return { label: "정상", color: "bg-brand-50 text-brand-600" };
}

function getNoteDisplay(
  row: DisplayRow,
  workSchedules: WorkSchedule[]
): { text: string; color: string } {
  const { record, vacationType, workDate } = row;

  // 종일 휴가 (출근 기록 없음)
  if (vacationType && !record) {
    return { text: `${vacationType} 사용`, color: "text-purple-600" };
  }

  // 출근했지만 아직 퇴근 안 함
  if (!record || !record.check_in || !record.check_out) {
    return { text: "-", color: "text-slate-400" };
  }

  // 퇴근 완료 — 자동 diff 계산
  const { workStart, workEnd } = getScheduleForDate(workSchedules, workDate);
  const standard = calcDayStandardMinutes(workStart, workEnd, vacationType ?? undefined);
  const actual = calcDayActualMinutes(record, vacationType ?? undefined) ?? 0;
  const diff = actual - standard;

  const label = formatSignedMinutes(diff);
  if (diff === 0) return { text: label, color: "text-slate-500" };
  if (diff > 0) return { text: label, color: "text-emerald-600" };
  return { text: label, color: "text-red-500" };
}

function getWorkTimeDisplay(row: DisplayRow): string {
  const { record, vacationType } = row;
  if (vacationType && !record) return "-";
  if (!record) return "0시간 0분";
  if (vacationType === "반차-오전" || vacationType === "반차-오후") {
    const actual = calcDayActualMinutes(record, vacationType);
    return formatMinutes(actual);
  }
  return formatMinutes(record.total_minutes);
}

export default function RecordsDetailTable({
  records,
  employeeName,
  periodLabel,
  workSchedules,
  isOwnRecord,
  vacationsByDate,
  rangeStart,
  rangeEnd,
}: RecordsDetailTableProps) {
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [showMissingModal, setShowMissingModal] = useState(false);

  /** 기록 + 범위 내 휴가 날짜를 합쳐 날짜 내림차순 정렬 */
  const rows: DisplayRow[] = useMemo(() => {
    const byDate = new Map<string, DisplayRow>();
    for (const r of records) {
      byDate.set(r.work_date, {
        workDate: r.work_date,
        record: r,
        vacationType: vacationsByDate[r.work_date] ?? null,
      });
    }
    for (const [date, vacationType] of Object.entries(vacationsByDate)) {
      if (date < rangeStart || date > rangeEnd) continue;
      if (byDate.has(date)) continue;
      byDate.set(date, { workDate: date, record: null, vacationType });
    }
    return Array.from(byDate.values()).sort((a, b) => b.workDate.localeCompare(a.workDate));
  }, [records, vacationsByDate, rangeStart, rangeEnd]);

  const handleExcelDownload = async () => {
    const XLSX = await import("xlsx");
    const data = rows.map((row) => {
      const status = getRecordStatus(row.record, row.vacationType, workSchedules, row.workDate);
      const note = getNoteDisplay(row, workSchedules);
      return {
        "날짜": row.workDate,
        "출근 시간": row.record ? formatTime(row.record.check_in) : "-",
        "퇴근 시간": row.record ? formatTime(row.record.check_out) : "-",
        "근무 시간": getWorkTimeDisplay(row),
        "상태": status.label,
        "비고": note.text,
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
            disabled={rows.length === 0}
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={isOwnRecord ? 7 : 6} className="text-center py-8 text-sm text-slate-400">
                  해당 기간의 기록이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const status = getRecordStatus(row.record, row.vacationType, workSchedules, row.workDate);
                const note = getNoteDisplay(row, workSchedules);
                const key = row.record?.id ?? `vac-${row.workDate}`;
                const rowRecord = row.record;
                return (
                  <tr key={key} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDate(row.workDate)}</td>
                    <td className="px-4 py-3 text-slate-700">{row.record ? formatTime(row.record.check_in) : "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{row.record ? formatTime(row.record.check_out) : "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{getWorkTimeDisplay(row)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-xs max-w-[200px] truncate ${note.color}`}>{note.text}</td>
                    {isOwnRecord && (
                      <td className="px-4 py-3">
                        {rowRecord ? (
                          <button
                            onClick={() => setSelectedRecord(rowRecord)}
                            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap px-2 py-2 rounded-lg hover:bg-brand-50 transition-colors"
                          >
                            <PencilSimple size={14} />
                            수정 요청
                          </button>
                        ) : null}
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
