"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Profile } from "@/lib/attendance/types";
import { createClient } from "@/lib/supabase/client";
import {
  getWorkTimelineEntries,
  getWorkTimelineProfiles,
} from "@/lib/work-timeline/queries";
import {
  cacheWorkTimeline,
  getCachedWorkTimeline,
} from "@/lib/work-timeline/timelineCache";
import type {
  WorkTimelineEntryWithProfile,
  WorkTimelineProfile,
} from "@/lib/work-timeline/types";

const WorkTimelineSection = dynamic(
  () => import("./work-timeline/WorkTimelineSection"),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-24 animate-pulse rounded-xl border border-slate-100 bg-slate-50/60"
        aria-label="업무 타임라인을 불러오는 중"
        aria-busy="true"
      />
    ),
  },
);

interface DashboardTimelineClientProps {
  currentUserId: string;
  currentUserRole: Profile["role"];
}

interface TimelineData {
  entries: WorkTimelineEntryWithProfile[];
  profiles: WorkTimelineProfile[];
}

export default function DashboardTimelineClient({
  currentUserId,
  currentUserRole,
}: DashboardTimelineClientProps) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    const loadTimeline = async () => {
      const cached = await getCachedWorkTimeline(currentUserId);
      if (!active) return;
      if (cached) setData(cached);

      try {
        const supabase = createClient();
        const [entries, profiles] = await Promise.all([
          getWorkTimelineEntries(supabase, {
            limit: 15,
            includeAttachments: false,
          }),
          getWorkTimelineProfiles(supabase),
        ]);
        if (!active) return;

        const fresh = { entries, profiles };
        setData(fresh);
        setLoadFailed(false);
        void cacheWorkTimeline(currentUserId, entries, profiles);
      } catch (error) {
        console.error("[dashboard] work timeline refresh failed:", error);
        if (active && !cached) setLoadFailed(true);
      }
    };

    void loadTimeline();
    return () => {
      active = false;
    };
  }, [currentUserId, reloadToken]);

  if (!data) {
    return (
      <div
        className="flex h-24 items-center justify-center rounded-xl border border-slate-100 bg-slate-50/60"
        aria-label="업무 타임라인을 불러오는 중"
        aria-busy={!loadFailed}
      >
        {loadFailed ? (
          <button
            type="button"
            onClick={() => {
              setLoadFailed(false);
              setReloadToken((current) => current + 1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            타임라인 다시 불러오기
          </button>
        ) : (
          <span className="text-xs text-slate-400">최근 업무를 불러오는 중입니다.</span>
        )}
      </div>
    );
  }

  return (
    <WorkTimelineSection
      initialEntries={data.entries}
      profiles={data.profiles}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      compact
    />
  );
}
