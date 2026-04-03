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
  if (!auth.profile.is_approved) redirect("/login?error=not_approved");

  const userData = {
    id: auth.user.id,
    email: auth.profile.email,
    name: auth.profile.full_name ?? auth.user.email?.split("@")[0] ?? "사용자",
    avatarUrl: auth.profile.avatar_url ?? null,
  };

  return <DashboardShell user={userData}>{children}</DashboardShell>;
}
