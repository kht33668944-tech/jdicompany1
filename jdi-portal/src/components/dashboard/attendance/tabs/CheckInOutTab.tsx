"use client";

import CheckInOutCard from "../CheckInOutCard";
import WeekSummaryCard from "../WeekSummaryCard";
import WorkScheduleCard from "../WorkScheduleCard";
import type {
  AttendanceRecord,
  WorkSchedule,
  WorkScheduleChangeRequest,
} from "@/lib/attendance/types";

interface CheckInOutTabProps {
  userId: string;
  isAdmin: boolean;
  todayRecord: AttendanceRecord | null;
  weekRecords: AttendanceRecord[];
  weekStart: string;
  workSchedules: WorkSchedule[];
  myChangeRequests: WorkScheduleChangeRequest[];
  allowedIp: string | null;
}

export default function CheckInOutTab({
  userId,
  isAdmin,
  todayRecord,
  weekRecords,
  weekStart,
  workSchedules,
  myChangeRequests,
  allowedIp,
}: CheckInOutTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CheckInOutCard userId={userId} todayRecord={todayRecord} allowedIp={allowedIp} />
        <WeekSummaryCard weekRecords={weekRecords} weekStart={weekStart} workSchedules={workSchedules} />
      </div>
      <WorkScheduleCard
        userId={userId}
        isAdmin={isAdmin}
        workSchedules={workSchedules}
        myChangeRequests={myChangeRequests}
      />
    </div>
  );
}
