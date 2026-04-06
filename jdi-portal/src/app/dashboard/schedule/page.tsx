import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import SchedulePageClient from "@/components/dashboard/schedule/SchedulePageClient";
import { getMonthSchedules } from "@/lib/schedule/queries";
import { getCachedAllProfiles } from "@/lib/attendance/queries";
import { toDateString } from "@/lib/utils/date";
import { getSingleValue, parseYearParam, parseMonthParam } from "@/lib/utils/params";
import type { Profile } from "@/lib/attendance/types";

type SchedulePageProps = {
  searchParams: Promise<{
    year?: string | string[];
    month?: string | string[];
  }>;
};

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const today = toDateString();
  const query = await searchParams;
  const defaultYear = Number(today.slice(0, 4));
  const defaultMonth = Number(today.slice(5, 7));
  const currentYear = parseYearParam(getSingleValue(query.year), defaultYear);
  const currentMonth = parseMonthParam(getSingleValue(query.month), defaultMonth);

  let schedules: Awaited<ReturnType<typeof getMonthSchedules>> = [];
  let profiles: Profile[] = [];

  try {
    [schedules, profiles] = await Promise.all([
      getMonthSchedules(auth.supabase, currentYear, currentMonth),
      getCachedAllProfiles(),
    ]);
  } catch {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-700 font-semibold">데이터를 불러오는 중 오류가 발생했습니다.</p>
        <p className="text-red-500 text-sm mt-1">잠시 후 다시 시도해주세요.</p>
      </div>
    );
  }

  return (
    <SchedulePageClient
      schedules={schedules}
      profiles={profiles}
      currentYear={currentYear}
      currentMonth={currentMonth}
      userId={auth.user.id}
      userRole={auth.profile.role}
    />
  );
}
