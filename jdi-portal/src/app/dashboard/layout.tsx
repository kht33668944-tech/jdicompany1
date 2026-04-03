import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import DashboardShell from "@/components/dashboard/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const userData = {
    email: auth.profile.email,
    name: auth.profile.full_name ?? auth.user.email?.split("@")[0] ?? "사용자",
    avatarUrl: auth.profile.avatar_url ?? null,
  };

  return <DashboardShell user={userData}>{children}</DashboardShell>;
}
