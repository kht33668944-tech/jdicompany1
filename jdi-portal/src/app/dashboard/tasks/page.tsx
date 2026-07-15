import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import TasksPageClient from "@/components/dashboard/tasks/TasksPageClient";
import { getCachedAllProfiles } from "@/lib/attendance/queries.server";
import { getInitialTasksWithDetails } from "@/lib/tasks/queries";
import { timeStage } from "@/lib/performance/timing";
import type { Profile } from "@/lib/attendance/types";
import type { TaskWithDetails } from "@/lib/tasks/types";

export default async function TasksPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  let profiles: Profile[] = [];
  let initialTasks: TaskWithDetails[] = [];

  try {
    [profiles, initialTasks] = await Promise.all([
      timeStage("/dashboard/tasks", "profiles", getCachedAllProfiles()),
      timeStage("/dashboard/tasks", "initialTasks", getInitialTasksWithDetails(auth.supabase)),
    ]);
  } catch {
    profiles = [];
    initialTasks = [];
  }

  return (
    <TasksPageClient
      profiles={profiles}
      userId={auth.user.id}
      initialTasks={initialTasks}
    />
  );
}
