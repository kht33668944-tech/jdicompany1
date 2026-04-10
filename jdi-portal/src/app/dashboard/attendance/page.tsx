import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import AttendancePageClient from "@/components/dashboard/attendance/AttendancePageClient";
import {
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
  getWorkSchedules,
  getMyWorkScheduleChangeRequests,
  getPendingWorkScheduleChangeRequests,
  getPendingHireDateChangeRequests,
  getPendingIpChangeRequests,
} from "@/lib/attendance/queries";
import { getCachedAllProfiles } from "@/lib/attendance/queries.server";
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
  let workSchedules: Awaited<ReturnType<typeof getWorkSchedules>> = [];
  let myWorkScheduleChangeRequests: Awaited<ReturnType<typeof getMyWorkScheduleChangeRequests>> = [];
  let pendingWorkScheduleChangeRequests: Awaited<ReturnType<typeof getPendingWorkScheduleChangeRequests>> | null = null;
  let pendingHireDateChangeRequests: Awaited<ReturnType<typeof getPendingHireDateChangeRequests>> | null = null;
  let pendingIpChangeRequests: Awaited<ReturnType<typeof getPendingIpChangeRequests>> | null = null;
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
      getWorkSchedules(supabase, user.id),
      getMyWorkScheduleChangeRequests(supabase, user.id),
    ] as const;

    if (profile.role === "admin") {
      const [tr, wr, mr, vb, vr, cr, ws, mwscr, ata, ap, pvr, cvr, pcr, pwscr, phdcr, pipcr] = await Promise.all([
        ...basePromises,
        getAllTodayAttendance(supabase),
        getCachedAllProfiles(),
        getPendingVacationRequests(supabase),
        getCancelVacationRequests(supabase),
        getPendingCorrectionRequests(supabase),
        getPendingWorkScheduleChangeRequests(supabase),
        getPendingHireDateChangeRequests(supabase),
        getPendingIpChangeRequests(supabase),
      ]);
      todayRecord = tr;
      weekRecords = wr;
      monthRecords = mr;
      vacationBalance = vb;
      vacationRequests = vr;
      correctionRequests = cr;
      workSchedules = ws;
      myWorkScheduleChangeRequests = mwscr;
      allTodayAttendance = ata;
      allProfiles = ap;
      pendingVacationRequests = pvr;
      cancelVacationRequests = cvr;
      pendingCorrectionRequests = pcr;
      pendingWorkScheduleChangeRequests = pwscr;
      pendingHireDateChangeRequests = phdcr;
      pendingIpChangeRequests = pipcr;
    } else {
      const [tr, wr, mr, vb, vr, cr, ws, mwscr] = await Promise.all([
        ...basePromises,
      ]);
      todayRecord = tr;
      weekRecords = wr;
      monthRecords = mr;
      vacationBalance = vb;
      vacationRequests = vr;
      correctionRequests = cr;
      workSchedules = ws;
      myWorkScheduleChangeRequests = mwscr;
    }
  } catch {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-700 font-semibold">데이터를 불러오는 중 오류가 발생했습니다.</p>
        <p className="text-red-500 text-sm mt-1">잠시 후 다시 시도해주세요.</p>
      </div>
    );
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
      workSchedules={workSchedules}
      myWorkScheduleChangeRequests={myWorkScheduleChangeRequests}
      pendingWorkScheduleChangeRequests={pendingWorkScheduleChangeRequests}
      pendingHireDateChangeRequests={pendingHireDateChangeRequests}
      pendingIpChangeRequests={pendingIpChangeRequests}
    />
  );
}
