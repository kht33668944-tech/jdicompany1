"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { AttendanceTabId } from "@/lib/attendance/constants";
import TabNavigation from "./TabNavigation";
import CheckInOutTab from "./tabs/CheckInOutTab";
import type { Profile, AttendancePageData } from "@/lib/attendance/types";

// 비-기본 탭은 클릭 시점에 chunk 로드 — 첫 진입 JS 번들 ↓
const RecordsTab = dynamic(() => import("./tabs/RecordsTab"), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const VacationTab = dynamic(() => import("./tabs/VacationTab"), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const AdminTab = dynamic(() => import("./tabs/AdminTab"), {
  ssr: false,
  loading: () => <TabSkeleton />,
});

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

function TabSkeleton() {
  return (
    <div className="glass-card rounded-2xl p-8 text-center text-sm text-slate-400">
      불러오는 중...
    </div>
  );
}

export default function AttendancePageClient({ profile, initialData }: AttendancePageClientProps) {
  const isAdmin = profile.role === "admin";
  const [activeTab, setActiveTab] = useState<AttendanceTabId>(() => getInitialTab(isAdmin));

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
          todayRecord={initialData.todayRecord}
          weekRecords={initialData.weekRecords}
          weekStart={initialData.weekStart}
          workSchedules={initialData.workSchedules}
          myChangeRequests={initialData.myWorkScheduleChangeRequests}
          allowedIp={profile.allowed_ip}
        />
      )}

      {activeTab === "records" && (
        <RecordsTab profile={profile} workSchedules={initialData.workSchedules} />
      )}

      {activeTab === "vacation" && <VacationTab userId={profile.id} />}

      {activeTab === "admin" && isAdmin && <AdminTab />}
    </div>
  );
}
