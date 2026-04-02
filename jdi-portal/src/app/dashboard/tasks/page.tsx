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

  let allTasks: Awaited<ReturnType<typeof getAllTasks>> = [];
  let myTasks: Awaited<ReturnType<typeof getMyTasks>> = [];
  let profiles: Awaited<ReturnType<typeof getAllProfiles>> = [];

  try {
    [allTasks, myTasks, profiles] = await Promise.all([
      getAllTasks(supabase),
      getMyTasks(supabase, user.id),
      getAllProfiles(supabase),
    ]);
  } catch {
    // DB 오류 시 빈 데이터로 페이지 렌더링
  }

  return (
    <TasksPageClient
      allTasks={allTasks}
      myTasks={myTasks}
      profiles={profiles}
      userId={user.id}
    />
  );
}
