import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { getDashboardDataFast } from "@/lib/dashboard/fast-queries";
import {
  getWorkTimelineEntries,
  getWorkTimelineProfiles,
} from "@/lib/work-timeline/queries";
import type {
  WorkTimelineEntryWithProfile,
  WorkTimelineProfile,
} from "@/lib/work-timeline/types";
import DashboardClient from "@/components/dashboard/DashboardClient";
import DashboardTimelineClient from "@/components/dashboard/DashboardTimelineClient";

type AuthenticatedUser = NonNullable<Awaited<ReturnType<typeof getAuthUser>>>;

async function getInitialWorkTimelineData(
  supabase: AuthenticatedUser["supabase"],
): Promise<{
  entries: WorkTimelineEntryWithProfile[];
  profiles: WorkTimelineProfile[];
}> {
  try {
    const [entries, profiles] = await Promise.all([
      getWorkTimelineEntries(supabase, { limit: 15 }),
      getWorkTimelineProfiles(supabase),
    ]);
    return { entries, profiles };
  } catch (error) {
    console.error("[dashboard] work timeline data failed:", error);
    return { entries: [], profiles: [] };
  }
}

interface DashboardTimelineProps {
  timelineData: ReturnType<typeof getInitialWorkTimelineData>;
  currentUserId: string;
  currentUserRole: AuthenticatedUser["profile"]["role"];
}

async function DashboardTimeline({
  timelineData,
  currentUserId,
  currentUserRole,
}: DashboardTimelineProps) {
  const { entries, profiles } = await timelineData;

  return (
    <DashboardTimelineClient
      initialEntries={entries}
      profiles={profiles}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
    />
  );
}

function DashboardTimelineSkeleton() {
  return (
    <div
      className="h-24 animate-pulse rounded-xl border border-slate-100 bg-slate-50/60"
      aria-label="업무 타임라인을 불러오는 중"
      aria-busy="true"
    />
  );
}

export default async function DashboardPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const defaultTaskAssigneeFilter = auth.profile.role === "admin" ? "all" : auth.user.id;
  const userName = auth.profile.full_name ?? auth.user.email?.split("@")[0] ?? "사용자";
  const canViewCompanyWork = auth.profile.role !== "employee";
  const dashboardDataPromise = getDashboardDataFast(
    auth.supabase,
    auth.user.id,
    userName,
    canViewCompanyWork
  );
  const timelineDataPromise = getInitialWorkTimelineData(auth.supabase);
  const initialData = await dashboardDataPromise;
  // The timestamp is intentionally captured once for the server-rendered payload.
  // eslint-disable-next-line react-hooks/purity
  const initialLoadedAt = Date.now();

  return (
    <DashboardClient
      userId={auth.user.id}
      userName={userName}
      initialData={initialData}
      initialLoadedAt={initialLoadedAt}
      defaultTaskAssigneeFilter={defaultTaskAssigneeFilter}
    >
      <Suspense fallback={<DashboardTimelineSkeleton />}>
        <DashboardTimeline
          timelineData={timelineDataPromise}
          currentUserId={auth.user.id}
          currentUserRole={auth.profile.role}
        />
      </Suspense>
    </DashboardClient>
  );
}
