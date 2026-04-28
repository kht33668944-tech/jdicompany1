import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser, type AuthUser } from "@/lib/supabase/auth";
import { getPool } from "@/lib/db/postgres";
import { getMonthRange } from "@/lib/utils/date";
import {
  getAllProfiles,
  getApprovedVacationsByRange,
} from "@/lib/attendance/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVED_STATUS = "승인";

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

async function loadRecordsViaSupabase(
  auth: AuthUser,
  startDate: string,
  endDate: string
) {
  const isAdmin = auth.profile.role === "admin";
  const profiles = isAdmin ? await getAllProfiles(auth.supabase) : [auth.profile];
  const userIds = profiles.map((profile) => profile.id);
  const prevRange = getPreviousMonthRange(startDate);

  if (userIds.length === 0) {
    return {
      profiles,
      records: [],
      vacations: [],
      prevRange,
    };
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
    throw recordsResult.error;
  }

  return {
    profiles,
    records: recordsResult.data ?? [],
    vacations,
    prevRange,
  };
}

async function loadRecordsViaPostgres(
  auth: AuthUser,
  startDate: string,
  endDate: string
) {
  const isAdmin = auth.profile.role === "admin";
  const pool = getPool();
  const profiles = isAdmin
    ? (await pool.query("select * from public.profiles order by full_name asc")).rows
    : [auth.profile];
  const userIds = profiles.map((profile) => profile.id);
  const prevRange = getPreviousMonthRange(startDate);

  if (userIds.length === 0) {
    return {
      profiles,
      records: [],
      vacations: [],
      prevRange,
    };
  }

  const [recordsResult, vacationsResult] = await Promise.all([
    pool.query(
      `
        select *
        from public.attendance_records
        where user_id = any($1::uuid[])
          and work_date >= $2
          and work_date <= $3
        order by work_date desc
      `,
      [userIds, prevRange.start, endDate]
    ),
    pool.query(
      `
        select *
        from public.vacation_requests
        where user_id = any($1::uuid[])
          and status = $2
          and start_date <= $3
          and end_date >= $4
      `,
      [userIds, APPROVED_STATUS, endDate, prevRange.start]
    ),
  ]);

  return {
    profiles,
    records: recordsResult.rows,
    vacations: vacationsResult.rows,
    prevRange,
  };
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

  if (!process.env.DATABASE_URL) {
    try {
      return NextResponse.json(await loadRecordsViaSupabase(auth, startDate, endDate));
    } catch (error) {
      console.error("[api/attendance/records] supabase fallback failed:", error);
      return NextResponse.json({ error: "Failed to load records" }, { status: 500 });
    }
  }

  try {
    return NextResponse.json(await loadRecordsViaPostgres(auth, startDate, endDate));
  } catch (error) {
    console.error("[api/attendance/records] direct db failed, falling back:", error);
    try {
      return NextResponse.json(await loadRecordsViaSupabase(auth, startDate, endDate));
    } catch (fallbackError) {
      console.error("[api/attendance/records] supabase fallback failed:", fallbackError);
      return NextResponse.json({ error: "Failed to load records" }, { status: 500 });
    }
  }
}
