"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AttendanceTabId } from "@/lib/attendance/constants";
import TabNavigation from "./TabNavigation";
import AdminTab from "./tabs/AdminTab";
import CheckInOutTab from "./tabs/CheckInOutTab";
import RecordsTab from "./tabs/RecordsTab";
import VacationTab from "./tabs/VacationTab";
import { createClient } from "@/lib/supabase/client";
import { getWeekRange, toDateString } from "@/lib/utils/date";
import {
  getAllTodayAttendance,
  getCancelVacationRequests,
  getCorrectionRequests,
  getPendingCorrectionRequests,
  getPendingVacationRequests,
  getTodayRecord,
  getVacationBalance,
  getVacationRequests,
  getWeekRecords,
  getWorkSchedules,
  getMyWorkScheduleChangeRequests,
  getPendingWorkScheduleChangeRequests,
  getAllProfiles,
  getPendingHireDateChangeRequests,
  getPendingIpChangeRequests,
} from "@/lib/attendance/queries";
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
  currentYear: number;
  currentMonth: number;
}

interface AttendanceData {
  todayRecord: AttendanceRecord | null;
  weekRecords: AttendanceRecord[];
  weekStart: string;
  vacationBalance: VacationBalance | null;
  vacationRequests: VacationRequest[];
  correctionRequests: CorrectionRequest[];
  workSchedules: WorkSchedule[];
  myWorkScheduleChangeRequests: WorkScheduleChangeRequest[];
  // admin
  allTodayAttendance: AttendanceWithProfile[] | null;
  allProfiles: Profile[] | null;
  pendingVacationRequests: VacationRequest[] | null;
  cancelVacationRequests: VacationRequest[] | null;
  pendingCorrectionRequests: CorrectionRequest[] | null;
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

export default function AttendancePageClient({ profile, currentYear, currentMonth }: AttendancePageClientProps) {
  const router = useRouter();
  const isAdmin = profile.role === "admin";
  const [activeTab, setActiveTab] = useState<AttendanceTabId>(() => getInitialTab(isAdmin));
  const [data, setData] = useState<AttendanceData | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const now = new Date();
    const { start: weekStart, end: weekEnd } = getWeekRange(now);

    try {
      const baseResults = await Promise.all([
        getTodayRecord(supabase, profile.id),
        getWeekRecords(supabase, profile.id, weekStart, weekEnd),
        getVacationBalance(supabase, profile.id),
        getVacationRequests(supabase, profile.id),
        getCorrectionRequests(supabase, profile.id),
        getWorkSchedules(supabase, profile.id),
        getMyWorkScheduleChangeRequests(supabase, profile.id),
      ]);

      let adminData: {
        allTodayAttendance: AttendanceWithProfile[] | null;
        allProfiles: Profile[] | null;
        pendingVacationRequests: VacationRequest[] | null;
        cancelVacationRequests: VacationRequest[] | null;
        pendingCorrectionRequests: CorrectionRequest[] | null;
        pendingWorkScheduleChangeRequests: WorkScheduleChangeRequest[] | null;
        pendingHireDateChangeRequests: HireDateChangeRequest[] | null;
        pendingIpChangeRequests: IpChangeRequest[] | null;
      } = {
        allTodayAttendance: null,
        allProfiles: null,
        pendingVacationRequests: null,
        cancelVacationRequests: null,
        pendingCorrectionRequests: null,
        pendingWorkScheduleChangeRequests: null,
        pendingHireDateChangeRequests: null,
        pendingIpChangeRequests: null,
      };

      if (isAdmin) {
        const [ata, ap, pvr, cvr, pcr, pwscr, phdcr, pipcr] = await Promise.all([
          getAllTodayAttendance(supabase),
          getAllProfiles(supabase),
          getPendingVacationRequests(supabase),
          getCancelVacationRequests(supabase),
          getPendingCorrectionRequests(supabase),
          getPendingWorkScheduleChangeRequests(supabase),
          getPendingHireDateChangeRequests(supabase),
          getPendingIpChangeRequests(supabase),
        ]);
        adminData = {
          allTodayAttendance: ata,
          allProfiles: ap,
          pendingVacationRequests: pvr,
          cancelVacationRequests: cvr,
          pendingCorrectionRequests: pcr,
          pendingWorkScheduleChangeRequests: pwscr,
          pendingHireDateChangeRequests: phdcr,
          pendingIpChangeRequests: pipcr,
        };
      }

      setData({
        todayRecord: baseResults[0],
        weekRecords: baseResults[1],
        weekStart,
        vacationBalance: baseResults[2],
        vacationRequests: baseResults[3],
        correctionRequests: baseResults[4],
        workSchedules: baseResults[5],
        myWorkScheduleChangeRequests: baseResults[6],
        ...adminData,
      });
    } catch (err) {
      console.error("[AttendancePageClient] fetchData failed:", err);
    }
  }, [profile.id, isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, activeTab);
  }, [activeTab]);

  // router.refresh() 대신 클라이언트에서 직접 재fetch
  const handleRefresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // 데이터 로딩 중 — 기존 loading.tsx 스켈레톤 활용
  if (!data) {
    return (
      <div className="space-y-6">
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} />
        <div className="bg-white/65 backdrop-blur-sm border border-white/80 rounded-2xl p-6 shadow-sm">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-200/70 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

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
