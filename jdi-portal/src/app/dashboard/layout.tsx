import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/attendance/queries";
import DashboardShell from "@/components/dashboard/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getProfile(supabase, user.id);

  const userData = {
    email: profile?.email ?? user.email ?? "",
    name: profile?.full_name ?? user.email?.split("@")[0] ?? "사용자",
    avatarUrl: profile?.avatar_url ?? null,
  };

  return <DashboardShell user={userData}>{children}</DashboardShell>;
}
