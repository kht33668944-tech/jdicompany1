import { createClient } from "@/lib/supabase/client";
import { ATTENDANCE_STATUS_CONFIG } from "./constants";
import type { AttendanceRecord, CorrectionRequest } from "./types";
import { toDateString } from "@/lib/utils/date";
import type { VacationType } from "./types";

function getSupabase() {
  return createClient();
}

const ATTENDANCE_STATUSES = Object.keys(ATTENDANCE_STATUS_CONFIG) as AttendanceRecord["status"][];
const WORKING_STATUS = ATTENDANCE_STATUSES[1];
const CHECKED_OUT_STATUS = ATTENDANCE_STATUSES[2];

export async function checkIn(userId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("attendance_records")
    .upsert(
      {
        user_id: userId,
        work_date: toDateString(),
        check_in: new Date().toISOString(),
        status: WORKING_STATUS,
      },
      { onConflict: "user_id,work_date" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function checkOut(userId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("attendance_records")
    .update({
      check_out: new Date().toISOString(),
      status: CHECKED_OUT_STATUS,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("work_date", toDateString())
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function submitVacationRequest(params: {
  userId: string;
  vacationType: VacationType;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("vacation_requests")
    .insert({
      user_id: params.userId,
      vacation_type: params.vacationType,
      start_date: params.startDate,
      end_date: params.endDate,
      days_count: params.daysCount,
      reason: params.reason || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function cancelVacationRequest(requestId: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("vacation_requests")
    .delete()
    .eq("id", requestId)
    .eq("status", "대기중");
  if (error) throw error;
}

export async function submitCorrectionRequest(params: {
  userId: string;
  attendanceRecordId: string | null;
  targetDate: string;
  requestType: CorrectionRequest["request_type"];
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  reason: string;
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("correction_requests")
    .insert({
      user_id: params.userId,
      attendance_record_id: params.attendanceRecordId,
      target_date: params.targetDate,
      request_type: params.requestType,
      requested_check_in: params.requestedCheckIn,
      requested_check_out: params.requestedCheckOut,
      reason: params.reason,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveVacationRequest(requestId: string, adminId: string) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("approve_vacation_request", {
    p_request_id: requestId,
    p_admin_id: adminId,
  });
  if (error) throw error;
}

export async function rejectVacationRequest(
  requestId: string,
  adminId: string,
  rejectReason: string
) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("vacation_requests")
    .update({
      status: "반려",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      reject_reason: rejectReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "대기중");
  if (error) throw error;
}

export async function approveCorrectionRequest(
  requestId: string,
  adminId: string
) {
  const supabase = getSupabase();

  const { data: correction, error: fetchError } = await supabase
    .from("correction_requests")
    .select("*")
    .eq("id", requestId)
    .eq("status", "대기중")
    .single();
  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase
    .from("correction_requests")
    .update({
      status: "승인",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "대기중");
  if (updateError) throw updateError;

  if (correction.request_type === "기록누락") {
    await supabase.from("attendance_records").upsert(
      {
        user_id: correction.user_id,
        work_date: correction.target_date,
        check_in: correction.requested_check_in,
        check_out: correction.requested_check_out,
        status: correction.requested_check_out ? CHECKED_OUT_STATUS : WORKING_STATUS,
      },
      { onConflict: "user_id,work_date" }
    );
  } else {
    const updateData: Record<string, string | null> = {};
    if (correction.requested_check_in) updateData.check_in = correction.requested_check_in;
    if (correction.requested_check_out) {
      updateData.check_out = correction.requested_check_out;
      updateData.status = CHECKED_OUT_STATUS;
    }
    if (Object.keys(updateData).length > 0) {
      await supabase
        .from("attendance_records")
        .update(updateData)
        .eq("user_id", correction.user_id)
        .eq("work_date", correction.target_date);
    }
  }
}

export async function rejectCorrectionRequest(
  requestId: string,
  adminId: string
) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("correction_requests")
    .update({
      status: "반려",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "대기중");
  if (error) throw error;
}
