import type { SupabaseClient } from "@supabase/supabase-js";
import { getPool } from "@/lib/db/postgres";
import { getWeekRange, toDateString } from "@/lib/utils/date";
import {
  getMyWorkScheduleChangeRequests,
  getTodayRecord,
  getWeekRecords,
  getWorkSchedules,
} from "./queries";
import type { AttendancePageData } from "./types";

async function getAttendancePageDataViaSupabase(
  supabase: SupabaseClient,
  userId: string
): Promise<AttendancePageData> {
  const { start: weekStart, end: weekEnd } = getWeekRange(new Date());
  const [todayRecord, weekRecords, workSchedules, myWorkScheduleChangeRequests] =
    await Promise.all([
      getTodayRecord(supabase, userId),
      getWeekRecords(supabase, userId, weekStart, weekEnd),
      getWorkSchedules(supabase, userId),
      getMyWorkScheduleChangeRequests(supabase, userId),
    ]);

  return {
    todayRecord,
    weekRecords,
    weekStart,
    workSchedules,
    myWorkScheduleChangeRequests,
  };
}

async function getAttendancePageDataViaPostgres(userId: string): Promise<AttendancePageData> {
  const { start: weekStart, end: weekEnd } = getWeekRange(new Date());
  const today = toDateString();
  const pool = getPool();

  const [todayRecord, weekRecords, workSchedules, myWorkScheduleChangeRequests] =
    await Promise.all([
      pool.query(
        `
          select *
          from public.attendance_records
          where user_id = $1 and work_date = $2
          limit 1
        `,
        [userId, today]
      ),
      pool.query(
        `
          select *
          from public.attendance_records
          where user_id = $1
            and work_date >= $2
            and work_date <= $3
          order by work_date asc
        `,
        [userId, weekStart, weekEnd]
      ),
      pool.query(
        `
          select *
          from public.work_schedules
          where user_id = $1
          order by effective_from asc
        `,
        [userId]
      ),
      pool.query(
        `
          select *
          from public.work_schedule_change_requests
          where user_id = $1
          order by created_at desc
        `,
        [userId]
      ),
    ]);

  return {
    todayRecord: todayRecord.rows[0] ?? null,
    weekRecords: weekRecords.rows,
    weekStart,
    workSchedules: workSchedules.rows,
    myWorkScheduleChangeRequests: myWorkScheduleChangeRequests.rows,
  };
}

export async function getAttendancePageData(
  supabase: SupabaseClient,
  userId: string
): Promise<AttendancePageData> {
  if (!process.env.DATABASE_URL) {
    return getAttendancePageDataViaSupabase(supabase, userId);
  }

  try {
    return await getAttendancePageDataViaPostgres(userId);
  } catch (error) {
    console.error("[attendance] postgres initial data failed, falling back:", error);
    return getAttendancePageDataViaSupabase(supabase, userId);
  }
}
