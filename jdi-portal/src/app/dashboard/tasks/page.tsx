import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import TasksPageClient from "@/components/dashboard/tasks/TasksPageClient";
import { getTasksPagePayloadFast } from "@/lib/tasks/fast-queries";
import { timeStage } from "@/lib/performance/timing";
import type { Profile } from "@/lib/attendance/types";
import type { TaskWithDetails } from "@/lib/tasks/types";

export default async function TasksPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  let profiles: Profile[] = [];
  let initialTasks: TaskWithDetails[] = [];

  try {
    // 직원목록 + 초기 할일을 단일 pg 왕복으로 조회(빠른 경로). 실패 시 REST 폴백.
    const payload = await timeStage(
      "/dashboard/tasks",
      "pagePayload",
      getTasksPagePayloadFast(auth.supabase, auth.user.id)
    );
    profiles = payload.profiles;
    initialTasks = payload.tasks;
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
