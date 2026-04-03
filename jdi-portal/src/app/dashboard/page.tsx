import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { getDashboardData } from "@/lib/dashboard/queries";
import DashboardClient from "@/components/dashboard/DashboardClient";

export default async function DashboardPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const userName = auth.profile.full_name ?? auth.user.email?.split("@")[0] ?? "사용자";
  const data = await getDashboardData(auth.supabase, auth.user.id, userName);

  return (
    <DashboardClient
      userId={auth.user.id}
      userName={userName}
      todayRecord={data.todayRecord}
      weeklyMinutes={data.weeklyMinutes}
      myTasks={data.myTasks}
      allTasksForUser={data.allTasksForUser}
      todaySchedules={data.todaySchedules}
      recentActivities={data.recentActivities}
      nextScheduleMinutes={data.nextScheduleMinutes}
    />
  );
}
