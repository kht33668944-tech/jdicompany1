"use client";

import AdminAttendanceTable from "../AdminAttendanceTable";
import AdminVacationRequests from "../AdminVacationRequests";
import AdminWorkScheduleRequests from "../AdminWorkScheduleRequests";
import type {
  AttendanceWithProfile,
  Profile,
  VacationRequest,
  CorrectionRequest,
  WorkScheduleChangeRequest,
} from "@/lib/attendance/types";

interface AdminTabProps {
  adminId: string;
  allTodayAttendance: AttendanceWithProfile[];
  allProfiles: Profile[];
  pendingVacationRequests: VacationRequest[];
  cancelVacationRequests: VacationRequest[];
  pendingCorrectionRequests: CorrectionRequest[];
  pendingWorkScheduleChangeRequests: WorkScheduleChangeRequest[];
}

export default function AdminTab({
  adminId,
  allTodayAttendance,
  allProfiles,
  pendingVacationRequests,
  cancelVacationRequests,
  pendingCorrectionRequests,
  pendingWorkScheduleChangeRequests,
}: AdminTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <AdminAttendanceTable todayAttendance={allTodayAttendance} allProfiles={allProfiles} />
      <div className="space-y-6">
        <AdminVacationRequests
          adminId={adminId}
          vacationRequests={pendingVacationRequests}
          cancelRequests={cancelVacationRequests}
          correctionRequests={pendingCorrectionRequests}
        />
        <AdminWorkScheduleRequests
          adminId={adminId}
          requests={pendingWorkScheduleChangeRequests}
        />
      </div>
    </div>
  );
}
