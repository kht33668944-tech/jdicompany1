import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TasksPageClient from "@/components/dashboard/tasks/TasksPageClient";
import { getTasksWithDetails } from "@/lib/tasks/queries";
import { getAllProfiles } from "@/lib/attendance/queries";

export default async function TasksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let allTasks: Awaited<ReturnType<typeof getTasksWithDetails>> = [];
  let profiles: Awaited<ReturnType<typeof getAllProfiles>> = [];

  try {
    [allTasks, profiles] = await Promise.all([
      getTasksWithDetails(supabase),
      getAllProfiles(supabase),
    ]);
  } catch {
    // DB 오류 시 빈 데이터로 페이지 렌더링
  }

  return (
    <TasksPageClient
      allTasks={allTasks}
      profiles={profiles}
      userId={user.id}
    />
  );
}
