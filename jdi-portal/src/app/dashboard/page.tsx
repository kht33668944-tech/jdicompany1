import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { getDashboardDataFast } from "@/lib/dashboard/fast-queries";
import DashboardClient from "@/components/dashboard/DashboardClient";
import DashboardTimelineClient from "@/components/dashboard/DashboardTimelineClient";

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
      <DashboardTimelineClient
        currentUserId={auth.user.id}
        currentUserRole={auth.profile.role}
      />
    </DashboardClient>
  );
}
