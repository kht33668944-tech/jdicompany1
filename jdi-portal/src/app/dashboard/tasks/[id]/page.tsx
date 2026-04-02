import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getTaskById,
  getChecklistItems,
  getSubtasks,
  getAttachments,
  getActivities,
} from "@/lib/tasks/queries";
import { getAllProfiles } from "@/lib/attendance/queries";
import TaskDetailClient from "@/components/dashboard/tasks/detail/TaskDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const task = await getTaskById(supabase, id);

  if (!task) {
    redirect("/dashboard/tasks");
  }

  const [checklist, subtasks, attachments, activities, profiles] = await Promise.all([
    getChecklistItems(supabase, id),
    getSubtasks(supabase, id),
    getAttachments(supabase, id),
    getActivities(supabase, id),
    getAllProfiles(supabase),
  ]);

  return (
    <TaskDetailClient
      task={task}
      checklist={checklist}
      subtasks={subtasks}
      attachments={attachments}
      activities={activities}
      profiles={profiles}
      userId={user.id}
    />
  );
}
