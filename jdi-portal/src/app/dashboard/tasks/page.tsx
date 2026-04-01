import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TasksPageClient from "@/components/dashboard/tasks/TasksPageClient";
import { getAllTasks, getMyTasks } from "@/lib/tasks/queries";
import { getAllProfiles } from "@/lib/attendance/queries";

export default async function TasksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [allTasks, myTasks, profiles] = await Promise.all([
    getAllTasks(supabase),
    getMyTasks(supabase, user.id),
    getAllProfiles(supabase),
  ]);

  return (
    <TasksPageClient
      allTasks={allTasks}
      myTasks={myTasks}
      profiles={profiles}
      userId={user.id}
    />
  );
}
