"use client";

import AdminRecordsView from "./records/AdminRecordsView";
import type { Profile, WorkSchedule } from "@/lib/attendance/types";

interface RecordsTabProps {
  profile: Profile;
  workSchedules: WorkSchedule[];
}

export default function RecordsTab({ profile, workSchedules }: RecordsTabProps) {
  return (
    <AdminRecordsView
      profile={profile}
      allProfiles={[profile]}
      workSchedules={workSchedules}
    />
  );
}
