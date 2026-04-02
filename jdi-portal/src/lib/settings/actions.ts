import { createClient } from "@/lib/supabase/client";

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

export async function updatePassword(newPassword: string) {
  const supabase = getSupabase();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function updateNotificationSettings(
  userId: string,
  settings: {
    vacation_notify: boolean;
    schedule_remind: boolean;
    task_deadline: boolean;
    system_announce: boolean;
  }
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
  const { error } = await supabase
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}
