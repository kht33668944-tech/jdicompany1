"use client";

import CheckInOutCard from "../CheckInOutCard";
import WeekSummaryCard from "../WeekSummaryCard";
import type { AttendanceRecord } from "@/lib/attendance/types";

interface CheckInOutTabProps {
  userId: string;
  todayRecord: AttendanceRecord | null;
  weekRecords: AttendanceRecord[];
  weekStart: string;
}

export default function CheckInOutTab({
  userId,
  todayRecord,
  weekRecords,
  weekStart,
}: CheckInOutTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <CheckInOutCard userId={userId} todayRecord={todayRecord} />
      <WeekSummaryCard weekRecords={weekRecords} weekStart={weekStart} />
    </div>
  );
}
