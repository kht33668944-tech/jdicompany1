import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import {
  getTaskById,
  getChecklistItems,
  getSubtasks,
  getAttachments,
  getActivities,
} from "@/lib/tasks/queries";
import { getCachedAllProfiles } from "@/lib/attendance/queries";
import TaskDetailClient from "@/components/dashboard/tasks/detail/TaskDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: Props) {
  const { id } = await params;
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const task = await getTaskById(auth.supabase, id);
  if (!task) redirect("/dashboard/tasks");

  const [checklist, subtasks, attachments, activities, profiles] = await Promise.all([
    getChecklistItems(auth.supabase, id),
    getSubtasks(auth.supabase, id),
    getAttachments(auth.supabase, id),
    getActivities(auth.supabase, id),
    getCachedAllProfiles(),
  ]);

  return (
    <TaskDetailClient
      task={task}
      checklist={checklist}
      subtasks={subtasks}
      attachments={attachments}
      activities={activities}
      profiles={profiles}
      userId={auth.user.id}
    />
  );
}
