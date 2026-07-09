import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { getDashboardDataFast } from "@/lib/dashboard/fast-queries";
import DashboardClient from "@/components/dashboard/DashboardClient";

export default async function DashboardPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const userName = auth.profile.full_name ?? auth.user.email?.split("@")[0] ?? "사용자";
  const canViewCompanyWork = auth.profile.role !== "employee";
  const initialData = await getDashboardDataFast(
    auth.supabase,
    auth.user.id,
    userName,
    canViewCompanyWork,
    auth.profile
  );

  return (
    <DashboardClient
      userName={userName}
      initialData={initialData}
    />
  );
}
