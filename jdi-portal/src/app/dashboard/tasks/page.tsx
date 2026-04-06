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
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-700 font-semibold">데이터를 불러오는 중 오류가 발생했습니다.</p>
        <p className="text-red-500 text-sm mt-1">잠시 후 다시 시도해주세요.</p>
      </div>
    );
  }

  return (
    <TasksPageClient
      allTasks={allTasks}
      profiles={profiles}
      userId={auth.user.id}
    />
  );
}
