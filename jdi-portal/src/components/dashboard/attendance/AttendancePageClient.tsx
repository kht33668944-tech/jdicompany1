"use client";

import { useEffect, useState } from "react";
import type { AttendanceTabId } from "@/lib/attendance/constants";
import TabNavigation from "./TabNavigation";
import AdminTab from "./tabs/AdminTab";
import CheckInOutTab from "./tabs/CheckInOutTab";
import RecordsTab from "./tabs/RecordsTab";
import VacationTab from "./tabs/VacationTab";
import type { Profile, AttendancePageData } from "@/lib/attendance/types";

interface AttendancePageClientProps {
  profile: Profile;
  currentYear: number;
  currentMonth: number;
  initialData: AttendancePageData;
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

export default function AttendancePageClient({ profile, initialData }: AttendancePageClientProps) {
  const isAdmin = profile.role === "admin";
  const [activeTab, setActiveTab] = useState<AttendanceTabId>(() => getInitialTab(isAdmin));

  // 데이터는 props에서 직접 사용 — router.refresh() 시 page.tsx가 재실행되어 새 props가 자동으로 들어옴
  const data = initialData;

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, activeTab);
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} />

      {activeTab === "checkin" && (
        <CheckInOutTab
          userId={profile.id}
          isAdmin={isAdmin}
          todayRecord={data.todayRecord}
          weekRecords={data.weekRecords}
          weekStart={data.weekStart}
          workSchedules={data.workSchedules}
          myChangeRequests={data.myWorkScheduleChangeRequests}
          allowedIp={profile.allowed_ip}
        />
      )}

      {activeTab === "records" && (
        <RecordsTab
          profile={profile}
          allProfiles={data.allProfiles ?? []}
          workSchedules={data.workSchedules}
        />
      )}

      {activeTab === "vacation" && (
        <VacationTab
          vacationBalance={data.vacationBalance}
          vacationRequests={data.vacationRequests}
        />
      )}

      {activeTab === "admin" && isAdmin && (
        <AdminTab
          allTodayAttendance={data.allTodayAttendance ?? []}
          allProfiles={data.allProfiles ?? []}
          pendingVacationRequests={data.pendingVacationRequests ?? []}
          cancelVacationRequests={data.cancelVacationRequests ?? []}
          pendingCorrectionRequests={data.pendingCorrectionRequests ?? []}
          pendingWorkScheduleChangeRequests={data.pendingWorkScheduleChangeRequests ?? []}
          pendingHireDateChangeRequests={data.pendingHireDateChangeRequests ?? []}
          pendingIpChangeRequests={data.pendingIpChangeRequests ?? []}
        />
      )}
    </div>
  );
}
