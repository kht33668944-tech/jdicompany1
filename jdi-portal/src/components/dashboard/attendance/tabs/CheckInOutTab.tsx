"use client";

import CheckInOutCard from "../CheckInOutCard";
import WeekSummaryCard from "../WeekSummaryCard";
import WorkScheduleCard from "../WorkScheduleCard";
import type { AttendanceRecord } from "@/lib/attendance/types";

interface CheckInOutTabProps {
  userId: string;
  todayRecord: AttendanceRecord | null;
  weekRecords: AttendanceRecord[];
  weekStart: string;
  workStartTime: string | null;
  workEndTime: string | null;
}

export default function CheckInOutTab({
  userId,
  todayRecord,
  weekRecords,
  weekStart,
  workStartTime,
  workEndTime,
}: CheckInOutTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CheckInOutCard userId={userId} todayRecord={todayRecord} />
        <WeekSummaryCard weekRecords={weekRecords} weekStart={weekStart} />
      </div>
      <WorkScheduleCard
        userId={userId}
        workStartTime={workStartTime}
        workEndTime={workEndTime}
      />
    </div>
  );
}
