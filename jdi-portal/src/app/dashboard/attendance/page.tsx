import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import AttendancePageClient from "@/components/dashboard/attendance/AttendancePageClient";
import { toDateString } from "@/lib/utils/date";
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

  const today = toDateString();
  const query = await searchParams;
  const defaultYear = Number(today.slice(0, 4));
  const defaultMonth = Number(today.slice(5, 7));
  const currentYear = parseYearParam(getSingleValue(query.year), defaultYear);
  const currentMonth = parseMonthParam(getSingleValue(query.month), defaultMonth);

  return (
    <AttendancePageClient
      profile={auth.profile}
      currentYear={currentYear}
      currentMonth={currentMonth}
    />
  );
}
