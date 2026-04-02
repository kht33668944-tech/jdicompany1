export type SchedulePresetCategory = "INTERNAL" | "REPORT" | "EXTERNAL" | "VACATION" | "MAINTENANCE";
export type ScheduleCategory = SchedulePresetCategory | string;
export type ScheduleVisibility = "company" | "private";
export type ScheduleTabId = "monthly" | "weekly" | "daily" | "list";

export interface Schedule {
  id: string;
  title: string;
  description: string | null;
  category: ScheduleCategory;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  location: string | null;
  visibility: ScheduleVisibility;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleParticipant {
  id: string;
  user_id: string;
  profiles: { full_name: string };
}

export interface ScheduleWithProfile extends Schedule {
  creator_profile: { full_name: string };
  schedule_participants?: ScheduleParticipant[];
}
