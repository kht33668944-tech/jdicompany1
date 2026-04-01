import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const userData = {
    email: user.email ?? "",
    name:
      (user.user_metadata?.full_name as string) ??
      (user.user_metadata?.name as string) ??
      user.email?.split("@")[0] ??
      "사용자",
  };

  return <DashboardShell user={userData}>{children}</DashboardShell>;
}
