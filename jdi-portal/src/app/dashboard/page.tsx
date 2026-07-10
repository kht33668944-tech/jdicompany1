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

async function getInitialWorkTimelineData(
  supabase: NonNullable<Awaited<ReturnType<typeof getAuthUser>>>["supabase"],
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

export default async function DashboardPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const userName = auth.profile.full_name ?? auth.user.email?.split("@")[0] ?? "사용자";
  const canViewCompanyWork = auth.profile.role !== "employee";
  const [initialData, timelineData] = await Promise.all([
    getDashboardDataFast(
      auth.supabase,
      auth.user.id,
      userName,
      canViewCompanyWork,
      auth.profile
    ),
    getInitialWorkTimelineData(auth.supabase),
  ]);

  return (
    <DashboardClient
      userId={auth.user.id}
      userName={userName}
      initialData={initialData}
      initialTimelineEntries={timelineData.entries}
      timelineProfiles={timelineData.profiles}
      currentUserRole={auth.profile.role}
    />
  );
}
