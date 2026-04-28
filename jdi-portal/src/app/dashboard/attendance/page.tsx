import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import AttendancePageClient from "@/components/dashboard/attendance/AttendancePageClient";
import { getWeekRange, toDateString } from "@/lib/utils/date";
import { getSingleValue, parseYearParam, parseMonthParam } from "@/lib/utils/params";
import {
  getTodayRecord,
  getWeekRecords,
  getVacationBalance,
  getVacationRequests,
  getCorrectionRequests,
  getWorkSchedules,
  getMyWorkScheduleChangeRequests,
  getAllTodayAttendance,
  getAllProfiles,
  getPendingVacationRequests,
  getCancelVacationRequests,
  getPendingCorrectionRequests,
  getPendingWorkScheduleChangeRequests,
  getPendingHireDateChangeRequests,
  getPendingIpChangeRequests,
} from "@/lib/attendance/queries";
import type { AttendancePageData } from "@/lib/attendance/types";

type AttendancePageProps = {
  searchParams: Promise<{
    year?: string | string[];
    month?: string | string[];
  }>;
};

// 쿼리 하나 fail이 페이지 전체를 깨뜨리지 않도록 fallback 반환
function logAndReturn<T>(fallback: T, name: string) {
  return (e: unknown) => {
    console.error(`[attendance/page] ${name} failed:`, e);
    return fallback;
  };
}

export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const { profile, supabase } = auth;
  const userId = profile.id;
  const isAdmin = profile.role === "admin";

  const today = toDateString();
  const query = await searchParams;
  const defaultYear = Number(today.slice(0, 4));
  const defaultMonth = Number(today.slice(5, 7));
  const currentYear = parseYearParam(getSingleValue(query.year), defaultYear);
  const currentMonth = parseMonthParam(getSingleValue(query.month), defaultMonth);

  // KST 연도 (UTC 자정 ~ KST 09시 사이 연도 어긋남 방지)
  const kstYear = Number(today.slice(0, 4));
  const now = new Date();
  const { start: weekStart, end: weekEnd } = getWeekRange(now);

  // 모든 사용자 공통 7개 — 각 쿼리 .catch로 보호 (한 쿼리 fail이 전체 페이지를 안 깨뜨림)
  const [
    todayRecord,
    weekRecords,
    vacationBalance,
    vacationRequests,
    correctionRequests,
    workSchedules,
    myWorkScheduleChangeRequests,
  ] = await Promise.all([
    getTodayRecord(supabase, userId).catch(logAndReturn(null, "getTodayRecord")),
    getWeekRecords(supabase, userId, weekStart, weekEnd).catch(logAndReturn([], "getWeekRecords")),
    getVacationBalance(supabase, userId, kstYear).catch(logAndReturn(null, "getVacationBalance")),
    getVacationRequests(supabase, userId).catch(logAndReturn([], "getVacationRequests")),
    getCorrectionRequests(supabase, userId).catch(logAndReturn([], "getCorrectionRequests")),
    getWorkSchedules(supabase, userId).catch(logAndReturn([], "getWorkSchedules")),
    getMyWorkScheduleChangeRequests(supabase, userId).catch(logAndReturn([], "getMyWorkScheduleChangeRequests")),
  ]);

  // admin 전용 8개 — 블록 통째 try/catch (admin 영역 fail이 일반 영역 안 망가뜨림)
  let adminData: Pick<AttendancePageData,
    | "allTodayAttendance"
    | "allProfiles"
    | "pendingVacationRequests"
    | "cancelVacationRequests"
    | "pendingCorrectionRequests"
    | "pendingWorkScheduleChangeRequests"
    | "pendingHireDateChangeRequests"
    | "pendingIpChangeRequests"
  > = {
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
    try {
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
    } catch (err) {
      console.error("[attendance/page] admin queries failed:", err);
    }
  }

  const initialData: AttendancePageData = {
    todayRecord,
    weekRecords,
    weekStart,
    vacationBalance,
    vacationRequests,
    correctionRequests,
    workSchedules,
    myWorkScheduleChangeRequests,
    ...adminData,
  };

  return (
    <AttendancePageClient
      profile={profile}
      currentYear={currentYear}
      currentMonth={currentMonth}
      initialData={initialData}
    />
  );
}
