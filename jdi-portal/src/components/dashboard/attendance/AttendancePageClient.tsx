"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { AttendanceTabId } from "@/lib/attendance/constants";
import { createClient } from "@/lib/supabase/client";
import {
  getMyWorkScheduleChangeRequests,
  getTodayRecord,
  getWeekRecords,
  getWorkSchedules,
} from "@/lib/attendance/queries";
import { getWeekRange } from "@/lib/utils/date";
import TabNavigation from "./TabNavigation";
import CheckInOutTab from "./tabs/CheckInOutTab";
import type { AttendancePageData, Profile } from "@/lib/attendance/types";

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

function CheckInOutSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl h-72 animate-pulse" />
        <div className="glass-card rounded-2xl h-72 animate-pulse" />
      </div>
      <div className="glass-card rounded-2xl h-44 animate-pulse" />
    </div>
  );
}

export default function AttendancePageClient({ profile }: AttendancePageClientProps) {
  const isAdmin = profile.role === "admin";
  const [activeTab, setActiveTab] = useState<AttendanceTabId>(() => getInitialTab(isAdmin));
  const [checkInData, setCheckInData] = useState<AttendancePageData | null>(null);
  const [checkInLoading, setCheckInLoading] = useState(true);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const { start: weekStart, end: weekEnd } = getWeekRange(new Date());

    setCheckInLoading(true);
    Promise.all([
      getTodayRecord(supabase, profile.id).catch(() => null),
      getWeekRecords(supabase, profile.id, weekStart, weekEnd).catch(() => []),
      getWorkSchedules(supabase, profile.id).catch(() => []),
      getMyWorkScheduleChangeRequests(supabase, profile.id).catch(() => []),
    ]).then(([todayRecord, weekRecords, workSchedules, myWorkScheduleChangeRequests]) => {
      if (cancelled) return;
      setCheckInData({
        todayRecord,
        weekRecords,
        weekStart,
        workSchedules,
        myWorkScheduleChangeRequests,
      });
      setCheckInLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  const workSchedules = checkInData?.workSchedules ?? [];

  return (
    <div className="space-y-6">
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} />

      {activeTab === "checkin" && (
        checkInLoading || !checkInData ? (
          <CheckInOutSkeleton />
        ) : (
          <CheckInOutTab
            userId={profile.id}
            isAdmin={isAdmin}
            todayRecord={checkInData.todayRecord}
            weekRecords={checkInData.weekRecords}
            weekStart={checkInData.weekStart}
            workSchedules={checkInData.workSchedules}
            myChangeRequests={checkInData.myWorkScheduleChangeRequests}
            allowedIp={profile.allowed_ip}
          />
        )
      )}

      {activeTab === "records" && (
        <RecordsTab profile={profile} workSchedules={workSchedules} />
      )}

      {activeTab === "vacation" && <VacationTab userId={profile.id} />}

      {activeTab === "admin" && isAdmin && <AdminTab />}
    </div>
  );
}
