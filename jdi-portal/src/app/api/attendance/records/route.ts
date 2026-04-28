import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getMonthRange } from "@/lib/utils/date";
import {
  getAllProfiles,
  getApprovedVacationsByRange,
} from "@/lib/attendance/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDateString(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getPreviousMonthRange(startDate: string) {
  const [year, month] = startDate.split("-").map(Number);
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  return getMonthRange(prevYear, prevMonth);
}

export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startDate = request.nextUrl.searchParams.get("start");
  const endDate = request.nextUrl.searchParams.get("end");
  if (!isDateString(startDate) || !isDateString(endDate) || startDate > endDate) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const isAdmin = auth.profile.role === "admin";
  const profiles = isAdmin ? await getAllProfiles(auth.supabase) : [auth.profile];
  const userIds = profiles.map((profile) => profile.id);
  const prevRange = getPreviousMonthRange(startDate);

  if (userIds.length === 0) {
    return NextResponse.json({
      profiles,
      records: [],
      vacations: [],
      prevRange,
    });
  }

  const [recordsResult, vacations] = await Promise.all([
    auth.supabase
      .from("attendance_records")
      .select("*")
      .in("user_id", userIds)
      .gte("work_date", prevRange.start)
      .lte("work_date", endDate)
      .order("work_date", { ascending: false }),
    getApprovedVacationsByRange(auth.supabase, userIds, prevRange.start, endDate),
  ]);

  if (recordsResult.error) {
    console.error("[api/attendance/records] records failed:", recordsResult.error);
    return NextResponse.json({ error: "Failed to load records" }, { status: 500 });
  }

  return NextResponse.json({
    profiles,
    records: recordsResult.data ?? [],
    vacations,
    prevRange,
  });
}
