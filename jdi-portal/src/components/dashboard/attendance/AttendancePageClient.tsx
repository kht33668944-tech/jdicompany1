"use client";

import { useEffect, useState } from "react";
import type { AttendanceTabId } from "@/lib/attendance/constants";
import TabNavigation from "./TabNavigation";
import AdminTab from "./tabs/AdminTab";
import CheckInOutTab from "./tabs/CheckInOutTab";
import RecordsTab from "./tabs/RecordsTab";
import VacationTab from "./tabs/VacationTab";
import type {
  AttendanceRecord,
  AttendanceWithProfile,
  CorrectionRequest,
  Profile,
  VacationBalance,
  VacationRequest,
  WorkSchedule,
  WorkScheduleChangeRequest,
  HireDateChangeRequest,
  IpChangeRequest,
} from "@/lib/attendance/types";

interface AttendancePageClientProps {
  profile: Profile;
  todayRecord: AttendanceRecord | null;
  weekRecords: AttendanceRecord[];
  weekStart: string;
  monthRecords: AttendanceRecord[];
  currentYear: number;
  currentMonth: number;
  vacationBalance: VacationBalance | null;
  vacationRequests: VacationRequest[];
  correctionRequests: CorrectionRequest[];
  allTodayAttendance: AttendanceWithProfile[] | null;
  allProfiles: Profile[] | null;
  pendingVacationRequests: VacationRequest[] | null;
  cancelVacationRequests: VacationRequest[] | null;
  pendingCorrectionRequests: CorrectionRequest[] | null;
  workSchedules: WorkSchedule[];
  myWorkScheduleChangeRequests: WorkScheduleChangeRequest[];
  pendingWorkScheduleChangeRequests: WorkScheduleChangeRequest[] | null;
  pendingHireDateChangeRequests: HireDateChangeRequest[] | null;
  pendingIpChangeRequests: IpChangeRequest[] | null;
}

const STORAGE_KEY = "attendance-active-tab";

function getInitialTab(isAdmin: boolean): AttendanceTabId {
  if (typeof window === "undefined") {
    return "checkin";
  }

  const savedTab = window.localStorage.getItem(STORAGE_KEY) as AttendanceTabId | null;
  if (!savedTab) {
    return "checkin";
  }

  if (!isAdmin && savedTab === "admin") {
    return "checkin";
  }

  return savedTab;
}

export default function AttendancePageClient(props: AttendancePageClientProps) {
  const isAdmin = props.profile.role === "admin";
  const [activeTab, setActiveTab] = useState<AttendanceTabId>(() => getInitialTab(isAdmin));

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, activeTab);
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} />

      {activeTab === "checkin" && (
        <CheckInOutTab
          userId={props.profile.id}
          isAdmin={isAdmin}
          todayRecord={props.todayRecord}
          weekRecords={props.weekRecords}
          weekStart={props.weekStart}
          workSchedules={props.workSchedules}
          myChangeRequests={props.myWorkScheduleChangeRequests}
          allowedIp={props.profile.allowed_ip}
        />
      )}

      {activeTab === "records" && (
        <RecordsTab
          profile={props.profile}
          allProfiles={props.allProfiles ?? []}
          workSchedules={props.workSchedules}
        />
      )}

      {activeTab === "vacation" && (
        <VacationTab
          userId={props.profile.id}
          vacationBalance={props.vacationBalance}
          vacationRequests={props.vacationRequests}
        />
      )}

      {activeTab === "admin" && isAdmin && (
        <AdminTab
          adminId={props.profile.id}
          allTodayAttendance={props.allTodayAttendance ?? []}
          allProfiles={props.allProfiles ?? []}
          pendingVacationRequests={props.pendingVacationRequests ?? []}
          cancelVacationRequests={props.cancelVacationRequests ?? []}
          pendingCorrectionRequests={props.pendingCorrectionRequests ?? []}
          pendingWorkScheduleChangeRequests={props.pendingWorkScheduleChangeRequests ?? []}
          pendingHireDateChangeRequests={props.pendingHireDateChangeRequests ?? []}
          pendingIpChangeRequests={props.pendingIpChangeRequests ?? []}
        />
      )}
    </div>
  );
}
