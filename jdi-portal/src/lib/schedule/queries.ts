import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScheduleWithProfile } from "./types";

const SCHEDULE_SELECT = `
  *,
  creator_profile:profiles!schedules_created_by_fkey(full_name),
  schedule_participants(id, user_id, profiles(full_name))
`;

export async function getMonthSchedules(
  supabase: SupabaseClient,
  year: number,
  month: number
): Promise<ScheduleWithProfile[]> {
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01T00:00:00+09:00`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59+09:00`;

  const { data, error } = await supabase
    .from("schedules")
    .select(SCHEDULE_SELECT)
    .lte("start_time", monthEnd)
    .gte("end_time", monthStart)
    .order("start_time", { ascending: true });

  if (error) throw error;
  return (data as ScheduleWithProfile[]) ?? [];
}

export async function getTodaySchedules(
  supabase: SupabaseClient,
  dateStr: string
): Promise<ScheduleWithProfile[]> {
  const dayStart = `${dateStr}T00:00:00+09:00`;
  const dayEnd = `${dateStr}T23:59:59+09:00`;

  const { data, error } = await supabase
    .from("schedules")
    .select(SCHEDULE_SELECT)
    .lte("start_time", dayEnd)
    .gte("end_time", dayStart)
    .order("start_time", { ascending: true });

  if (error) throw error;
  return (data as ScheduleWithProfile[]) ?? [];
}
