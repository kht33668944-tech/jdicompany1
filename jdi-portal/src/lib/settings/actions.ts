import { createClient } from "@/lib/supabase/client";
import { NotificationSettings } from "@/lib/settings/types";
import { createNotification } from "@/lib/notifications/actions";

function getSupabase() {
  return createClient();
}

export async function updateProfile(params: {
  userId: string;
  fullName: string;
  department: string;
  phone: string;
  bio: string;
}) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: params.fullName,
      department: params.department,
      phone: params.phone || null,
      bio: params.bio || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.userId);
  if (error) throw error;
}

export async function uploadAvatar(userId: string, file: File) {
  const supabase = getSupabase();
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (updateError) throw updateError;

  return avatarUrl;
}

/** 첫 입사일 설정 (hire_date_locked = false 일 때만) */
export async function setInitialHireDate(hireDate: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("set_initial_hire_date", {
    p_hire_date: hireDate,
  });
  if (error) throw error;
  return data;
}

/** 입사일 변경 요청 제출 */
export async function submitHireDateChangeRequest(params: {
  hireDate: string;
  reason: string;
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("submit_hire_date_change_request", {
    p_hire_date: params.hireDate,
    p_reason: params.reason ?? "",
  });
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
          type: "hire_date_change_requested",
          title: "입사일 변경 요청",
          body: `요청 입사일: ${params.hireDate}`,
          link: "/dashboard/attendance",
        })
      )
    );
  }
  return data;
}

/** 본인 대기중 요청 취소 */
export async function cancelMyHireDateChangeRequest(requestId: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("hire_date_change_requests")
    .delete()
    .eq("id", requestId)
    .eq("status", "대기중");
  if (error) throw error;
}

/** 변경 요청 승인 (관리자) */
export async function approveHireDateChangeRequest(
  requestId: string,
  adminId: string
) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("approve_hire_date_change_request", {
    p_request_id: requestId,
  });
  if (error) throw error;

  const { data: req } = await supabase
    .from("hire_date_change_requests")
    .select("user_id, requested_hire_date")
    .eq("id", requestId)
    .single();
  if (req) {
    await createNotification({
      userId: req.user_id,
      type: "hire_date_approved",
      title: "입사일 변경이 승인되었습니다",
      body: `새 입사일: ${req.requested_hire_date}`,
      link: "/dashboard/settings",
    });
  }
}

/** 변경 요청 반려 (관리자) */
export async function rejectHireDateChangeRequest(
  requestId: string,
  adminId: string,
  rejectReason: string
) {
  const supabase = getSupabase();
  const { data: req } = await supabase
    .from("hire_date_change_requests")
    .select("user_id, requested_hire_date")
    .eq("id", requestId)
    .single();

  const { error } = await supabase.rpc("reject_hire_date_change_request", {
    p_request_id: requestId,
    p_reason: rejectReason,
  });
  if (error) throw error;

  if (req) {
    await createNotification({
      userId: req.user_id,
      type: "hire_date_rejected",
      title: "입사일 변경이 반려되었습니다",
      body: `사유: ${rejectReason}`,
      link: "/dashboard/settings",
    });
  }
}

/** 관리자가 직원의 입사일 직접 저장 */
export async function adminSetHireDate(params: {
  userId: string;
  hireDate: string;
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("admin_set_hire_date", {
    p_user_id: params.userId,
    p_hire_date: params.hireDate,
  });
  if (error) throw error;
  return data;
}

export async function updatePassword(newPassword: string) {
  const supabase = getSupabase();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function updateNotificationSettings(
  userId: string,
  settings: Partial<Omit<NotificationSettings, "user_id">>
) {
  const supabase = getSupabase();
  const { error } = await supabase.from("notification_settings").upsert(
    {
      user_id: userId,
      ...settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

export async function addDepartment(name: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from("departments").insert({ name });
  if (error) throw error;
}

export async function deleteDepartment(id: string) {
  const supabase = getSupabase();
  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) throw error;
}

export async function updateUserRole(
  userId: string,
  role: "employee" | "admin"
) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("admin_update_user_role", {
    target_user_id: userId,
    new_role: role,
  });
  if (error) throw error;
}

export async function approveUser(userId: string) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("admin_approve_user", {
    p_target_user_id: userId,
  });
  if (error) throw error;
}

export async function rejectUser(userId: string) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("admin_reject_user", {
    p_target_user_id: userId,
  });
  if (error) throw error;
}
