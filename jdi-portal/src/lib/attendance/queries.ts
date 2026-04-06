import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { toDateString, getMonthRange } from "@/lib/utils/date";
import type {
  Profile,
  AttendanceRecord,
  VacationBalance,
  VacationRequest,
  CorrectionRequest,
  AttendanceWithProfile,
} from "./types";

export async function getProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getTodayRecord(
  supabase: SupabaseClient,
  userId: string
): Promise<AttendanceRecord | null> {
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("user_id", userId)
    .eq("work_date", toDateString())
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getWeekRecords(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
  weekEnd: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("user_id", userId)
    .gte("work_date", weekStart)
    .lte("work_date", weekEnd)
    .order("work_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getMonthRecords(
  supabase: SupabaseClient,
  userId: string,
  year: number,
  month: number
): Promise<AttendanceRecord[]> {
  const { start, end } = getMonthRange(year, month);
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("user_id", userId)
    .gte("work_date", start)
    .lte("work_date", end)
    .order("work_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getVacationBalance(
  supabase: SupabaseClient,
  userId: string,
  year: number = new Date().getFullYear()
): Promise<VacationBalance | null> {
  const { data, error } = await supabase
    .from("vacation_balances")
    .select("*")
    .eq("user_id", userId)
    .eq("year", year)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getVacationRequests(
  supabase: SupabaseClient,
  userId: string
): Promise<VacationRequest[]> {
  const { data, error } = await supabase
    .from("vacation_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCorrectionRequests(
  supabase: SupabaseClient,
  userId: string
): Promise<CorrectionRequest[]> {
  const { data, error } = await supabase
    .from("correction_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getEmployeeRecordsByRange(
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("user_id", userId)
    .gte("work_date", startDate)
    .lte("work_date", endDate)
    .order("work_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Admin queries
export async function getAllTodayAttendance(
  supabase: SupabaseClient
): Promise<AttendanceWithProfile[]> {
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*, profiles(full_name, email, department)")
    .eq("work_date", toDateString())
    .order("check_in", { ascending: true });
  if (error) throw error;
  return (data as AttendanceWithProfile[]) ?? [];
}

export async function getAllProfiles(
  supabase: SupabaseClient
): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** 요청 단위 캐싱 — 같은 렌더에서 여러 번 호출해도 1회만 실행 */
export const getCachedAllProfiles = cache(async (): Promise<Profile[]> => {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  return getAllProfiles(supabase);
});

export async function getPendingVacationRequests(
  supabase: SupabaseClient
): Promise<VacationRequest[]> {
  const { data, error } = await supabase
    .from("vacation_requests")
    .select("*, profiles:user_id(full_name)")
    .eq("status", "대기중")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as VacationRequest[]) ?? [];
}

export async function getCancelVacationRequests(
  supabase: SupabaseClient
): Promise<VacationRequest[]> {
  const { data, error } = await supabase
    .from("vacation_requests")
    .select("*, profiles:user_id(full_name)")
    .eq("status", "취소요청")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as VacationRequest[]) ?? [];
}

export async function getPendingCorrectionRequests(
  supabase: SupabaseClient
): Promise<CorrectionRequest[]> {
  const { data, error } = await supabase
    .from("correction_requests")
    .select("*, profiles:user_id(full_name)")
    .eq("status", "대기중")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as CorrectionRequest[]) ?? [];
}

export async function getApprovedVacationsForMonth(
  supabase: SupabaseClient,
  year: number,
  month: number
): Promise<VacationRequest[]> {
  const { start, end } = getMonthRange(year, month);
  const { data, error } = await supabase
    .from("vacation_requests")
    .select("*, profiles:user_id(full_name)")
    .eq("status", "승인")
    .lte("start_date", end)
    .gte("end_date", start)
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data as VacationRequest[]) ?? [];
}
