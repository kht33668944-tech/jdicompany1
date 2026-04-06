import { createClient } from "@/lib/supabase/client";
import { ATTENDANCE_STATUS_CONFIG } from "./constants";
import type { AttendanceRecord, CorrectionRequest } from "./types";
import { toDateString } from "@/lib/utils/date";
import type { VacationType } from "./types";
import { createNotification } from "@/lib/notifications/actions";

function getSupabase() {
  return createClient();
}

async function verifyAdmin(supabase: ReturnType<typeof getSupabase>, adminId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", adminId)
    .single();

  if (profile?.role !== "admin") {
    throw new Error("권한이 없습니다: 관리자만 가능합니다.");
  }
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

export async function requestVacationCancel(requestId: string) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("request_vacation_cancel", {
    p_request_id: requestId,
  });
  if (error) throw error;
}

export async function cancelApprovedVacation(requestId: string, adminId: string) {
  const supabase = getSupabase();
  await verifyAdmin(supabase, adminId);
  const { error } = await supabase.rpc("cancel_approved_vacation", {
    p_request_id: requestId,
    p_admin_id: adminId,
  });
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
  await verifyAdmin(supabase, adminId);
  const { error } = await supabase.rpc("approve_vacation_request", {
    p_request_id: requestId,
    p_admin_id: adminId,
  });
  if (error) throw error;

  // 알림: 신청자에게
  const { data: req } = await supabase
    .from("vacation_requests")
    .select("user_id, vacation_type, start_date, end_date")
    .eq("id", requestId)
    .single();
  if (req) {
    await createNotification({
      userId: req.user_id,
      type: "vacation_approved",
      title: "휴가가 승인되었습니다",
      body: `${req.vacation_type} (${req.start_date} ~ ${req.end_date})`,
      link: "/dashboard/attendance",
    });
  }
}

export async function rejectVacationRequest(
  requestId: string,
  adminId: string,
  rejectReason: string
) {
  const supabase = getSupabase();
  await verifyAdmin(supabase, adminId);

  // 신청자 정보 먼저 조회
  const { data: req } = await supabase
    .from("vacation_requests")
    .select("user_id, vacation_type, start_date, end_date")
    .eq("id", requestId)
    .single();

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

  // 알림: 신청자에게
  if (req) {
    await createNotification({
      userId: req.user_id,
      type: "vacation_rejected",
      title: "휴가가 반려되었습니다",
      body: `${req.vacation_type} (${req.start_date} ~ ${req.end_date}) — 사유: ${rejectReason}`,
      link: "/dashboard/attendance",
    });
  }
}

export async function approveCorrectionRequest(
  requestId: string,
  adminId: string
) {
  const supabase = getSupabase();
  await verifyAdmin(supabase, adminId);

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
    const { error: upsertError } = await supabase.from("attendance_records").upsert(
      {
        user_id: correction.user_id,
        work_date: correction.target_date,
        check_in: correction.requested_check_in,
        check_out: correction.requested_check_out,
        status: correction.requested_check_out ? CHECKED_OUT_STATUS : WORKING_STATUS,
      },
      { onConflict: "user_id,work_date" }
    );
    if (upsertError) throw upsertError;
  } else {
    const updateData: Record<string, string | null> = {};
    if (correction.requested_check_in) updateData.check_in = correction.requested_check_in;
    if (correction.requested_check_out) {
      updateData.check_out = correction.requested_check_out;
      updateData.status = CHECKED_OUT_STATUS;
    }
    if (Object.keys(updateData).length > 0) {
      const { error: attendanceError } = await supabase
        .from("attendance_records")
        .update(updateData)
        .eq("user_id", correction.user_id)
        .eq("work_date", correction.target_date);
      if (attendanceError) throw attendanceError;
    }
  }
}

export async function rejectVacationCancel(
  requestId: string,
  adminId: string
) {
  const supabase = getSupabase();
  await verifyAdmin(supabase, adminId);
  const { data, error } = await supabase
    .from("vacation_requests")
    .update({
      status: "승인",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "취소요청")
    .select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("취소 요청 거부에 실패했습니다. 해당 요청을 찾을 수 없습니다.");
  }
}

export async function rejectCorrectionRequest(
  requestId: string,
  adminId: string
) {
  const supabase = getSupabase();
  await verifyAdmin(supabase, adminId);
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

export async function updateWorkSchedule(
  userId: string,
  workStartTime: string | null,
  workEndTime: string | null
) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      work_start_time: workStartTime,
      work_end_time: workEndTime,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("work_start_time, work_end_time")
    .single();
  if (error) throw error;
  return data;
}
