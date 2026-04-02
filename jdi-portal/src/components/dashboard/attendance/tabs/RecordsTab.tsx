"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "phosphor-react";
import AttendanceCalendar from "../AttendanceCalendar";
import AttendanceTable from "../AttendanceTable";
import CorrectionRequestModal from "../CorrectionRequestModal";
import type { AttendanceRecord } from "@/lib/attendance/types";

interface RecordsTabProps {
  userId: string;
  monthRecords: AttendanceRecord[];
  currentYear: number;
  currentMonth: number;
}

export default function RecordsTab({ userId, monthRecords, currentYear, currentMonth }: RecordsTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [showMissingModal, setShowMissingModal] = useState(false);

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
        <div>
          <AttendanceCalendar
            records={monthRecords}
            year={currentYear}
            month={currentMonth}
            onMonthChange={handleMonthChange}
          />
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
