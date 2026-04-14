import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import DashboardClient from "@/components/dashboard/DashboardClient";

export default async function DashboardPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const userName = auth.profile.full_name ?? auth.user.email?.split("@")[0] ?? "사용자";

  return (
    <DashboardClient
      userId={auth.user.id}
      userName={userName}
    />
  );
}
