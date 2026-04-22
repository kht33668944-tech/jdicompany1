"use server";

import { createClient } from "@/lib/supabase/server";
import type { CorrectionRequest } from "./types";
import { toDateString } from "@/lib/utils/date";
import type { VacationType } from "./types";
import { createNotification } from "@/lib/notifications/actions";

async function getSessionUserId() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Not authenticated");
  return { supabase, userId: session.user.id };
}

async function requireAdmin() {
  const { supabase, userId } = await getSessionUserId();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (profile?.role !== "admin") {
    throw new Error("권한이 없습니다: 관리자만 가능합니다.");
  }
  return { supabase, userId };
}


export async function submitVacationRequest(params: {
  vacationType: VacationType;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
}) {
  const { supabase, userId } = await getSessionUserId();
  const { data, error } = await supabase
    .from("vacation_requests")
    .insert({
      user_id: userId,
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
  const { supabase } = await getSessionUserId();
  const { error } = await supabase
    .from("vacation_requests")
    .delete()
    .eq("id", requestId)
    .eq("status", "대기중");
  if (error) throw error;
}

export async function requestVacationCancel(requestId: string) {
  const { supabase } = await getSessionUserId();
  const { error } = await supabase.rpc("request_vacation_cancel", {
    p_request_id: requestId,
  });
  if (error) throw error;
}

export async function cancelApprovedVacation(requestId: string) {
  const { supabase, userId } = await requireAdmin();
  const { error } = await supabase.rpc("cancel_approved_vacation", {
    p_request_id: requestId,
    p_admin_id: userId,
  });
  if (error) throw error;
}

export async function submitCorrectionRequest(params: {
  attendanceRecordId: string | null;
  targetDate: string;
  requestType: CorrectionRequest["request_type"];
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  reason: string;
}) {
  const { supabase, userId } = await getSessionUserId();
  const { data, error } = await supabase
    .from("correction_requests")
    .insert({
      user_id: userId,
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

export async function approveVacationRequest(requestId: string) {
  const { supabase, userId } = await requireAdmin();
  const { error } = await supabase.rpc("approve_vacation_request", {
    p_request_id: requestId,
    p_admin_id: userId,
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
  rejectReason: string
) {
  const { supabase, userId } = await requireAdmin();

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
      reviewed_by: userId,
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

export async function approveCorrectionRequest(requestId: string) {
  const { supabase } = await requireAdmin();
  // 정정 승인 + attendance_records 반영을 RPC 한 트랜잭션으로 처리
  // (admin 권한 검사도 RPC 내부에서 수행)
  const { error } = await supabase.rpc("approve_correction_request", {
    p_request_id: requestId,
  });
  if (error) {
    console.error("[approveCorrectionRequest] RPC 실패:", {
      requestId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    // 프로덕션에서도 메시지가 보이도록 원인을 한국어로 감싸서 rethrow
    throw new Error(
      `정정 요청 승인 실패 (${error.code ?? "unknown"}): ${error.message}`
    );
  }

  // 신청자에게 알림
  const { data: req } = await supabase
    .from("correction_requests")
    .select("user_id, target_date, request_type")
    .eq("id", requestId)
    .single();
  if (req) {
    await createNotification({
      userId: req.user_id,
      type: "system_announce",
      title: "출퇴근 정정이 승인되었습니다",
      body: `${req.target_date} ${req.request_type}`,
      link: "/dashboard/attendance",
    });
  }
}

export async function rejectVacationCancel(requestId: string) {
  const { supabase, userId } = await requireAdmin();
  const { data, error } = await supabase
    .from("vacation_requests")
    .update({
      status: "승인",
      reviewed_by: userId,
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

export async function rejectCorrectionRequest(requestId: string) {
  const { supabase, userId } = await requireAdmin();

  const { data: req } = await supabase
    .from("correction_requests")
    .select("user_id, target_date, request_type")
    .eq("id", requestId)
    .single();

  const { error } = await supabase
    .from("correction_requests")
    .update({
      status: "반려",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "대기중");
  if (error) {
    console.error("[rejectCorrectionRequest] UPDATE 실패:", {
      requestId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(
      `정정 요청 반려 실패 (${error.code ?? "unknown"}): ${error.message}`
    );
  }

  if (req) {
    await createNotification({
      userId: req.user_id,
      type: "system_announce",
      title: "출퇴근 정정이 반려되었습니다",
      body: `${req.target_date} ${req.request_type}`,
      link: "/dashboard/attendance",
    });
  }
}

/** 첫 근무시간 설정 (이력에 비-시드 행이 없을 때만 가능) */
export async function setInitialWorkSchedule(
  startTime: string,
  endTime: string
) {
  const { supabase } = await getSessionUserId();
  const { data, error } = await supabase.rpc("set_initial_work_schedule", {
    p_start: startTime,
    p_end: endTime,
  });
  if (error) throw error;
  return data;
}

/** 근무시간 변경 요청 제출 */
export async function submitWorkScheduleChangeRequest(params: {
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  reason: string;
}) {
  const { supabase } = await getSessionUserId();
  const { data, error } = await supabase.rpc(
    "submit_work_schedule_change_request",
    {
      p_start: params.startTime,
      p_end: params.endTime,
      p_effective_from: params.effectiveFrom,
      p_reason: params.reason ?? "",
    }
  );
  if (error) throw error;

  // 모든 관리자에게 알림
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");
  if (admins) {
    await Promise.all(
      admins.map((a: { id: string }) =>
        createNotification({
          userId: a.id,
          type: "work_schedule_change_requested",
          title: "근무시간 변경 요청",
          body: `${params.startTime.slice(0, 5)} ~ ${params.endTime.slice(
            0,
            5
          )} (적용일: ${params.effectiveFrom})`,
          link: "/dashboard/attendance",
        })
      )
    );
  }
  return data;
}

/** 본인 대기중 요청 취소 */
export async function cancelMyWorkScheduleChangeRequest(requestId: string) {
  const { supabase } = await getSessionUserId();
  const { error } = await supabase
    .from("work_schedule_change_requests")
    .delete()
    .eq("id", requestId)
    .eq("status", "대기중");
  if (error) throw error;
}

/** 변경 요청 승인 (관리자) */
export async function approveWorkScheduleChangeRequest(requestId: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc(
    "approve_work_schedule_change_request",
    { p_request_id: requestId }
  );
  if (error) throw error;

  // 신청자에게 알림
  const { data: req } = await supabase
    .from("work_schedule_change_requests")
    .select(
      "user_id, requested_start_time, requested_end_time, effective_from"
    )
    .eq("id", requestId)
    .single();
  if (req) {
    await createNotification({
      userId: req.user_id,
      type: "work_schedule_approved",
      title: "근무시간 변경이 승인되었습니다",
      body: `${req.requested_start_time.slice(
        0,
        5
      )} ~ ${req.requested_end_time.slice(0, 5)} (적용일: ${req.effective_from})`,
      link: "/dashboard/attendance",
    });
  }
}

/** 변경 요청 반려 (관리자) */
export async function rejectWorkScheduleChangeRequest(
  requestId: string,
  rejectReason: string
) {
  const { supabase } = await requireAdmin();
  const { data: req } = await supabase
    .from("work_schedule_change_requests")
    .select("user_id, requested_start_time, requested_end_time, effective_from")
    .eq("id", requestId)
    .single();

  const { error } = await supabase.rpc("reject_work_schedule_change_request", {
    p_request_id: requestId,
    p_reason: rejectReason,
  });
  if (error) throw error;

  if (req) {
    await createNotification({
      userId: req.user_id,
      type: "work_schedule_rejected",
      title: "근무시간 변경이 반려되었습니다",
      body: `사유: ${rejectReason}`,
      link: "/dashboard/attendance",
    });
  }
}

/** 관리자가 직접 저장 (즉시 반영) */
export async function adminSetWorkSchedule(params: {
  userId: string;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
}) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_set_work_schedule", {
    p_user_id: params.userId,
    p_start: params.startTime,
    p_end: params.endTime,
    p_effective_from: params.effectiveFrom,
  });
  if (error) throw error;
  return data;
}
