"use client";

import AdminRecordsView from "./records/AdminRecordsView";
import type { Profile } from "@/lib/attendance/types";

interface RecordsTabProps {
  profile: Profile;
  allProfiles: Profile[];
}

export default function RecordsTab({ profile, allProfiles }: RecordsTabProps) {
  return (
    <AdminRecordsView
      profile={profile}
      allProfiles={allProfiles.length > 0 ? allProfiles : [profile]}
    />
  );
}
