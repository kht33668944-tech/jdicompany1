"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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

  const handleMonthChange = (year: number, month: number) => {
    setSelectedRecord(null);
    router.replace(`${pathname}?year=${year}&month=${month}`);
  };

  return (
    <div className="space-y-6">
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
    </div>
  );
}
