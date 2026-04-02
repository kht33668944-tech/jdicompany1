import { redirect } from "next/navigation";
import SchedulePageClient from "@/components/dashboard/schedule/SchedulePageClient";
import { getMonthSchedules } from "@/lib/schedule/queries";
import { getAllProfiles } from "@/lib/attendance/queries";
import { createClient } from "@/lib/supabase/server";
import { toDateString } from "@/lib/utils/date";
import type { Profile } from "@/lib/attendance/types";

type SchedulePageProps = {
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

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

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
      getMonthSchedules(supabase, currentYear, currentMonth),
      getAllProfiles(supabase),
    ]);
  } catch {
    // DB 오류 시 빈 데이터로 페이지 렌더링
  }

  return (
    <SchedulePageClient
      schedules={schedules}
      profiles={profiles}
      currentYear={currentYear}
      currentMonth={currentMonth}
      userId={user.id}
      userRole={profile?.role ?? "employee"}
    />
  );
}
