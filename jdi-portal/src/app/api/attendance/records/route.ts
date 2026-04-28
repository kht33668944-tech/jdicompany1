import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser, type AuthUser } from "@/lib/supabase/auth";
import { getPool, isPostgresUsable, markPostgresUnavailable } from "@/lib/db/postgres";
import {
  getAllProfiles,
  getApprovedVacationsByRange,
} from "@/lib/attendance/queries";
import { getMonthRange } from "@/lib/utils/date";
import type { AttendanceRecord, Profile, VacationRequest } from "@/lib/attendance/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVED_STATUS = "\uc2b9\uc778";

type RecordsPayload = {
  profiles: Profile[];
  records: AttendanceRecord[];
  vacations: VacationRequest[];
  prevRange: { start: string; end: string };
};

function isDateString(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toDateOnly(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeRecord(row: Record<string, unknown>): AttendanceRecord {
  return {
    ...row,
    work_date: toDateOnly(row.work_date),
  } as unknown as AttendanceRecord;
}

function normalizeVacation(row: Record<string, unknown>): VacationRequest {
  return {
    ...row,
    start_date: toDateOnly(row.start_date),
    end_date: toDateOnly(row.end_date),
  } as unknown as VacationRequest;
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
): Promise<RecordsPayload> {
  const isAdmin = auth.profile.role === "admin";
  const profiles = isAdmin ? await getAllProfiles(auth.supabase) : [auth.profile];
  const userIds = profiles.map((profile) => profile.id);
  const prevRange = getPreviousMonthRange(startDate);

  if (userIds.length === 0) {
    return { profiles, records: [], vacations: [], prevRange };
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
    records: (recordsResult.data as AttendanceRecord[] | null) ?? [],
    vacations,
    prevRange,
  };
}

async function loadRecordsViaPostgres(
  auth: AuthUser,
  startDate: string,
  endDate: string
): Promise<RecordsPayload> {
  const isAdmin = auth.profile.role === "admin";
  const pool = getPool();
  const profiles = isAdmin
    ? ((await pool.query("select * from public.profiles order by full_name asc")).rows as Profile[])
    : [auth.profile];
  const userIds = profiles.map((profile) => profile.id);
  const prevRange = getPreviousMonthRange(startDate);

  if (userIds.length === 0) {
    return { profiles, records: [], vacations: [], prevRange };
  }

  const [recordsResult, vacationsResult] = await Promise.all([
    pool.query(
      `
        select *
        from public.attendance_records
        where user_id = any($1::uuid[])
          and work_date >= $2::date
          and work_date <= $3::date
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
          and start_date <= $3::date
          and end_date >= $4::date
      `,
      [userIds, APPROVED_STATUS, endDate, prevRange.start]
    ),
  ]);

  return {
    profiles,
    records: recordsResult.rows.map(normalizeRecord),
    vacations: vacationsResult.rows.map(normalizeVacation),
    prevRange,
  };
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const auth = await getAuthUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startDate = request.nextUrl.searchParams.get("start");
  const endDate = request.nextUrl.searchParams.get("end");
  if (!isDateString(startDate) || !isDateString(endDate) || startDate > endDate) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  function json(data: RecordsPayload, source: string) {
    const elapsedMs = Date.now() - startedAt;
    const response = NextResponse.json({
      ...data,
      query: { startDate, endDate },
      source,
      elapsedMs,
      recordCount: data.records.length,
      profileCount: data.profiles.length,
    });
    response.headers.set("x-records-source", source);
    response.headers.set("x-records-elapsed-ms", String(elapsedMs));
    response.headers.set("x-records-count", String(data.records.length));
    return response;
  }

  if (!isPostgresUsable()) {
    try {
      return json(await loadRecordsViaSupabase(auth, startDate, endDate), "supabase");
    } catch (error) {
      console.error("[api/attendance/records] supabase failed:", error);
      return NextResponse.json({ error: "Failed to load records" }, { status: 500 });
    }
  }

  try {
    const pgPayload = await loadRecordsViaPostgres(auth, startDate, endDate);
    if (pgPayload.records.length > 0) {
      return json(pgPayload, "postgres");
    }

    const fallbackPayload = await loadRecordsViaSupabase(auth, startDate, endDate);
    if (fallbackPayload.records.length > 0) {
      return json(fallbackPayload, "supabase-empty-pg");
    }

    return json(pgPayload, "postgres-empty");
  } catch (error) {
    markPostgresUnavailable();
    console.error("[api/attendance/records] postgres failed, falling back:", error);
    try {
      return json(await loadRecordsViaSupabase(auth, startDate, endDate), "supabase-fallback");
    } catch (fallbackError) {
      console.error("[api/attendance/records] supabase fallback failed:", fallbackError);
      return NextResponse.json({ error: "Failed to load records" }, { status: 500 });
    }
  }
}
