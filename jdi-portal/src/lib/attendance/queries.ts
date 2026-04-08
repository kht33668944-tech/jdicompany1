import type { SupabaseClient } from "@supabase/supabase-js";
import { toDateString, getMonthRange } from "@/lib/utils/date";
import type {
  Profile,
  AttendanceRecord,
  VacationBalance,
  VacationRequest,
  CorrectionRequest,
  AttendanceWithProfile,
  WorkSchedule,
  WorkScheduleChangeRequest,
  HireDateChangeRequest,
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
  // 1) 우선 기존 레코드 조회
  const { data, error } = await supabase
    .from("vacation_balances")
    .select("*")
    .eq("user_id", userId)
    .eq("year", year)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  // 2) 없으면 프로필의 입사일 기준으로 자동 생성 (SECURITY DEFINER RPC)
  const { data: ensured, error: rpcError } = await supabase.rpc(
    "ensure_vacation_balance",
    { p_user_id: userId, p_year: year }
  );
  if (rpcError) {
    // RPC 실패는 치명적이지 않음 - null 반환해 0일로 표시 (로그만)
    console.error("ensure_vacation_balance failed:", rpcError);
    return null;
  }
  return (ensured as VacationBalance) ?? null;
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

/** 직원 본인의 모든 근무시간 이력 (effective_from ASC) */
export async function getWorkSchedules(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkSchedule[]> {
  const { data, error } = await supabase
    .from("work_schedules")
    .select("*")
    .eq("user_id", userId)
    .order("effective_from", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** 오늘 시점 적용 중인 근무시간 1행 */
export async function getCurrentWorkSchedule(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkSchedule | null> {
  const today = toDateString();
  const { data, error } = await supabase
    .from("work_schedules")
    .select("*")
    .eq("user_id", userId)
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** 본인의 변경 요청 목록 */
export async function getMyWorkScheduleChangeRequests(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkScheduleChangeRequest[]> {
  const { data, error } = await supabase
    .from("work_schedule_change_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** 관리자용: 대기 중 변경 요청 전체 */
export async function getPendingWorkScheduleChangeRequests(
  supabase: SupabaseClient
): Promise<WorkScheduleChangeRequest[]> {
  const { data, error } = await supabase
    .from("work_schedule_change_requests")
    .select("*, profiles:user_id(full_name)")
    .eq("status", "대기중")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as WorkScheduleChangeRequest[]) ?? [];
}

/** 관리자용: 특정 직원의 모든 이력 */
export async function getWorkSchedulesForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkSchedule[]> {
  return getWorkSchedules(supabase, userId);
}

/** 관리자용: 대기 중 입사일 변경 요청 전체 */
export async function getPendingHireDateChangeRequests(
  supabase: SupabaseClient
): Promise<HireDateChangeRequest[]> {
  const { data, error } = await supabase
    .from("hire_date_change_requests")
    .select("*, profiles:user_id(full_name, hire_date)")
    .eq("status", "대기중")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as HireDateChangeRequest[]) ?? [];
}

/** 본인의 입사일 변경 요청 목록 */
export async function getMyHireDateChangeRequests(
  supabase: SupabaseClient,
  userId: string
): Promise<HireDateChangeRequest[]> {
  const { data, error } = await supabase
    .from("hire_date_change_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
