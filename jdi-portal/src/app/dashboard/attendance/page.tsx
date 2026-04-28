import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import AttendancePageClient from "@/components/dashboard/attendance/AttendancePageClient";
import { getWeekRange, toDateString } from "@/lib/utils/date";
import { getSingleValue, parseYearParam, parseMonthParam } from "@/lib/utils/params";
import {
  getTodayRecord,
  getWeekRecords,
  getWorkSchedules,
  getMyWorkScheduleChangeRequests,
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

  const today = toDateString();
  const query = await searchParams;
  const defaultYear = Number(today.slice(0, 4));
  const defaultMonth = Number(today.slice(5, 7));
  const currentYear = parseYearParam(getSingleValue(query.year), defaultYear);
  const currentMonth = parseMonthParam(getSingleValue(query.month), defaultMonth);

  const now = new Date();
  const { start: weekStart, end: weekEnd } = getWeekRange(now);

  // 첫 진입 시 기본 탭(checkin)에 필요한 데이터만 SSR.
  // 나머지 탭(records/vacation/admin) 데이터는 탭 클릭 시점에 클라이언트에서 fetch.
  const [
    todayRecord,
    weekRecords,
    workSchedules,
    myWorkScheduleChangeRequests,
  ] = await Promise.all([
    getTodayRecord(supabase, userId).catch(logAndReturn(null, "getTodayRecord")),
    getWeekRecords(supabase, userId, weekStart, weekEnd).catch(logAndReturn([], "getWeekRecords")),
    getWorkSchedules(supabase, userId).catch(logAndReturn([], "getWorkSchedules")),
    getMyWorkScheduleChangeRequests(supabase, userId).catch(logAndReturn([], "getMyWorkScheduleChangeRequests")),
  ]);

  const initialData: AttendancePageData = {
    todayRecord,
    weekRecords,
    weekStart,
    workSchedules,
    myWorkScheduleChangeRequests,
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
