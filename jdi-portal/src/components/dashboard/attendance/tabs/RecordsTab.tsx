"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AdminRecordsView from "./records/AdminRecordsView";
import type { Profile, WorkSchedule } from "@/lib/attendance/types";

interface RecordsTabProps {
  profile: Profile;
  workSchedules: WorkSchedule[];
}

// 관리자만 직원 목록을 dropdown 으로 보여주므로, 일반 사용자는 fetch 생략
export default function RecordsTab({ profile, workSchedules }: RecordsTabProps) {
  const isAdmin = profile.role === "admin";
  const [allProfiles, setAllProfiles] = useState<Profile[]>(() => [profile]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .order("full_name", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[RecordsTab] getAllProfiles failed:", error);
          return;
        }
        if (data) setAllProfiles(data as Profile[]);
      });
    return () => { cancelled = true; };
  }, [isAdmin]);

  return (
    <AdminRecordsView
      profile={profile}
      allProfiles={allProfiles}
      workSchedules={workSchedules}
    />
  );
}
