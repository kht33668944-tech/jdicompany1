import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import TasksPageClient from "@/components/dashboard/tasks/TasksPageClient";
import { getCachedAllProfiles } from "@/lib/attendance/queries.server";
import type { Profile } from "@/lib/attendance/types";

export default async function TasksPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  let profiles: Profile[] = [];

  try {
    profiles = await getCachedAllProfiles();
  } catch {
    profiles = [];
  }

  return (
    <TasksPageClient
      profiles={profiles}
      userId={auth.user.id}
      initialTasks={[]}
    />
  );
}
