"use client";

import AdminAttendanceTable from "../AdminAttendanceTable";
import AdminVacationRequests from "../AdminVacationRequests";
import type { AttendanceWithProfile, Profile, VacationRequest, CorrectionRequest } from "@/lib/attendance/types";

interface AdminTabProps {
  adminId: string;
  allTodayAttendance: AttendanceWithProfile[];
  allProfiles: Profile[];
  pendingVacationRequests: VacationRequest[];
  pendingCorrectionRequests: CorrectionRequest[];
}

export default function AdminTab({ adminId, allTodayAttendance, allProfiles, pendingVacationRequests, pendingCorrectionRequests }: AdminTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <AdminAttendanceTable todayAttendance={allTodayAttendance} allProfiles={allProfiles} />
      <AdminVacationRequests adminId={adminId} vacationRequests={pendingVacationRequests} correctionRequests={pendingCorrectionRequests} />
    </div>
  );
}
