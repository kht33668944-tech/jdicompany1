import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import TasksPageClient from "@/components/dashboard/tasks/TasksPageClient";
import { getCachedTasksWithDetails } from "@/lib/tasks/queries";
import { getCachedAllProfiles } from "@/lib/attendance/queries";
import type { TaskWithDetails } from "@/lib/tasks/types";
import type { Profile } from "@/lib/attendance/types";

export default async function TasksPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  let allTasks: TaskWithDetails[] = [];
  let profiles: Profile[] = [];

  try {
    [allTasks, profiles] = await Promise.all([
      getCachedTasksWithDetails(),
      getCachedAllProfiles(),
    ]);
  } catch {
    // DB 오류 시 빈 데이터로 페이지 렌더링
  }

  return (
    <TasksPageClient
      allTasks={allTasks}
      profiles={profiles}
      userId={auth.user.id}
    />
  );
}
