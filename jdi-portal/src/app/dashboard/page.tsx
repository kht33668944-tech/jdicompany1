import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/attendance/queries";
import { getDashboardData } from "@/lib/dashboard/queries";
import DashboardClient from "@/components/dashboard/DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await getProfile(supabase, user.id);
  const userName = profile?.full_name ?? user.email?.split("@")[0] ?? "사용자";

  const data = await getDashboardData(supabase, user.id, userName);

  return (
    <DashboardClient
      userId={user.id}
      userName={userName}
      todayRecord={data.todayRecord}
      weeklyMinutes={data.weeklyMinutes}
      weekdayWorked={data.weekdayWorked}
      myTasks={data.myTasks}
      allTasksForUser={data.allTasksForUser}
      todaySchedules={data.todaySchedules}
      recentActivities={data.recentActivities}
      nextScheduleMinutes={data.nextScheduleMinutes}
    />
  );
}
