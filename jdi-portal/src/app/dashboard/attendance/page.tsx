import { redirect } from "next/navigation";
import AttendancePageClient from "@/components/dashboard/attendance/AttendancePageClient";
import {
  getAllProfiles,
  getAllTodayAttendance,
  getCancelVacationRequests,
  getCorrectionRequests,
  getMonthRecords,
  getPendingCorrectionRequests,
  getPendingVacationRequests,
  getProfile,
  getTodayRecord,
  getVacationBalance,
  getVacationRequests,
  getWeekRecords,
} from "@/lib/attendance/queries";
import { createClient } from "@/lib/supabase/server";
import { getWeekRange, toDateString } from "@/lib/utils/date";

type AttendancePageProps = {
  searchParams: Promise<{
    year?: string | string[];
    month?: string | string[];
  }>;
};

function getSingleValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function parseYearParam(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : fallback;
}

function parseMonthParam(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : fallback;
}

export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const now = new Date();
  const today = toDateString(now);
  const query = await searchParams;
  const defaultYear = Number(today.slice(0, 4));
  const defaultMonth = Number(today.slice(5, 7));
  const currentYear = parseYearParam(getSingleValue(query.year), defaultYear);
  const currentMonth = parseMonthParam(getSingleValue(query.month), defaultMonth);
  const { start: weekStart, end: weekEnd } = getWeekRange(now);

  const profile = await getProfile(supabase, user.id);
  if (!profile) {
    redirect("/login");
  }

  let todayRecord = null;
  let weekRecords: Awaited<ReturnType<typeof getWeekRecords>> = [];
  let monthRecords: Awaited<ReturnType<typeof getMonthRecords>> = [];
  let vacationBalance = null;
  let vacationRequests: Awaited<ReturnType<typeof getVacationRequests>> = [];
  let correctionRequests: Awaited<ReturnType<typeof getCorrectionRequests>> = [];

  try {
    [todayRecord, weekRecords, monthRecords, vacationBalance, vacationRequests, correctionRequests] =
      await Promise.all([
        getTodayRecord(supabase, user.id),
        getWeekRecords(supabase, user.id, weekStart, weekEnd),
        getMonthRecords(supabase, user.id, currentYear, currentMonth),
        getVacationBalance(supabase, user.id),
        getVacationRequests(supabase, user.id),
        getCorrectionRequests(supabase, user.id),
      ]);
  } catch {
    // DB 오류 시 빈 데이터로 페이지 렌더링
  }

  let allTodayAttendance = null;
  let allProfiles = null;
  let pendingVacationRequests = null;
  let cancelVacationRequests = null;
  let pendingCorrectionRequests = null;

  if (profile.role === "admin") {
    try {
      [allTodayAttendance, allProfiles, pendingVacationRequests, cancelVacationRequests, pendingCorrectionRequests] =
        await Promise.all([
          getAllTodayAttendance(supabase),
          getAllProfiles(supabase),
          getPendingVacationRequests(supabase),
          getCancelVacationRequests(supabase),
          getPendingCorrectionRequests(supabase),
        ]);
    } catch {
      // DB 오류 시 빈 데이터로 페이지 렌더링
    }
  }

  return (
    <AttendancePageClient
      profile={profile}
      todayRecord={todayRecord}
      weekRecords={weekRecords}
      weekStart={weekStart}
      monthRecords={monthRecords}
      currentYear={currentYear}
      currentMonth={currentMonth}
      vacationBalance={vacationBalance}
      vacationRequests={vacationRequests}
      correctionRequests={correctionRequests}
      allTodayAttendance={allTodayAttendance}
      allProfiles={allProfiles}
      pendingVacationRequests={pendingVacationRequests}
      cancelVacationRequests={cancelVacationRequests}
      pendingCorrectionRequests={pendingCorrectionRequests}
    />
  );
}
