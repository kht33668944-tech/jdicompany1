"use client";

import AdminRecordsView from "./records/AdminRecordsView";
import type { Profile, WorkSchedule } from "@/lib/attendance/types";

interface RecordsTabProps {
  profile: Profile;
  allProfiles: Profile[];
  workSchedules: WorkSchedule[];
}

export default function RecordsTab({ profile, allProfiles, workSchedules }: RecordsTabProps) {
  return (
    <AdminRecordsView
      profile={profile}
      allProfiles={allProfiles.length > 0 ? allProfiles : [profile]}
      workSchedules={workSchedules}
    />
  );
}
