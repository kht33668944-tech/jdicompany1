import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationSettings, Department } from "./types";

export async function getNotificationSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<NotificationSettings | null> {
  const { data } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("user_id", userId)
    .single();
  return data;
}

export async function getDepartments(
  supabase: SupabaseClient
): Promise<Department[]> {
  const { data } = await supabase
    .from("departments")
    .select("*")
    .order("name");
  return data ?? [];
}
