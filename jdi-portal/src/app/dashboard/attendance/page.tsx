import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import AttendancePageClient from "@/components/dashboard/attendance/AttendancePageClient";
import {
  getCachedAllProfiles,
  getAllTodayAttendance,
  getCancelVacationRequests,
  getCorrectionRequests,
  getMonthRecords,
  getPendingCorrectionRequests,
  getPendingVacationRequests,
  getTodayRecord,
  getVacationBalance,
  getVacationRequests,
  getWeekRecords,
} from "@/lib/attendance/queries";
import { getWeekRange, toDateString } from "@/lib/utils/date";
import { getSingleValue, parseYearParam, parseMonthParam } from "@/lib/utils/params";

type AttendancePageProps = {
  searchParams: Promise<{
    year?: string | string[];
    month?: string | string[];
  }>;
};

export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const { user, profile, supabase } = auth;

  const now = new Date();
  const today = toDateString(now);
  const query = await searchParams;
  const defaultYear = Number(today.slice(0, 4));
  const defaultMonth = Number(today.slice(5, 7));
  const currentYear = parseYearParam(getSingleValue(query.year), defaultYear);
  const currentMonth = parseMonthParam(getSingleValue(query.month), defaultMonth);
  const { start: weekStart, end: weekEnd } = getWeekRange(now);

  let todayRecord = null;
  let weekRecords: Awaited<ReturnType<typeof getWeekRecords>> = [];
  let monthRecords: Awaited<ReturnType<typeof getMonthRecords>> = [];
  let vacationBalance = null;
  let vacationRequests: Awaited<ReturnType<typeof getVacationRequests>> = [];
  let correctionRequests: Awaited<ReturnType<typeof getCorrectionRequests>> = [];
  let allTodayAttendance = null;
  let allProfiles = null;
  let pendingVacationRequests = null;
  let cancelVacationRequests = null;
  let pendingCorrectionRequests = null;

  try {
    // 유저 데이터 + admin 데이터를 한 번에 병렬 fetch
    const basePromises = [
      getTodayRecord(supabase, user.id),
      getWeekRecords(supabase, user.id, weekStart, weekEnd),
      getMonthRecords(supabase, user.id, currentYear, currentMonth),
      getVacationBalance(supabase, user.id),
      getVacationRequests(supabase, user.id),
      getCorrectionRequests(supabase, user.id),
    ] as const;

    if (profile.role === "admin") {
      const [tr, wr, mr, vb, vr, cr, ata, ap, pvr, cvr, pcr] = await Promise.all([
        ...basePromises,
        getAllTodayAttendance(supabase),
        getCachedAllProfiles(),
        getPendingVacationRequests(supabase),
        getCancelVacationRequests(supabase),
        getPendingCorrectionRequests(supabase),
      ]);
      todayRecord = tr;
      weekRecords = wr;
      monthRecords = mr;
      vacationBalance = vb;
      vacationRequests = vr;
      correctionRequests = cr;
      allTodayAttendance = ata;
      allProfiles = ap;
      pendingVacationRequests = pvr;
      cancelVacationRequests = cvr;
      pendingCorrectionRequests = pcr;
    } else {
      [todayRecord, weekRecords, monthRecords, vacationBalance, vacationRequests, correctionRequests] =
        await Promise.all([...basePromises]);
    }
  } catch {
    // DB 오류 시 빈 데이터로 페이지 렌더링
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
