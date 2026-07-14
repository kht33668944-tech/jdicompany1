"use client";

import dynamic from "next/dynamic";
import type { Profile } from "@/lib/attendance/types";
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
  initialEntries: WorkTimelineEntryWithProfile[];
  profiles: WorkTimelineProfile[];
  currentUserId: string;
  currentUserRole: Profile["role"];
}

export default function DashboardTimelineClient({
  initialEntries,
  profiles,
  currentUserId,
  currentUserRole,
}: DashboardTimelineClientProps) {
  return (
    <WorkTimelineSection
      initialEntries={initialEntries}
      profiles={profiles}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      compact
    />
  );
}
