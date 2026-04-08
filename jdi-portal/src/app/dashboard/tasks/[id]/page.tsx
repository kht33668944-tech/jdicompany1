import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import {
  getTaskBasic,
  getChecklistItems,
  getSubtasksBasic,
  getAttachments,
  getActivities,
} from "@/lib/tasks/queries";
import { getCachedAllProfiles } from "@/lib/attendance/queries.server";
import TaskDetailClient from "@/components/dashboard/tasks/detail/TaskDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: Props) {
  const { id } = await params;
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  // 모든 쿼리를 병렬 실행 — 순차 대기 없음
  const [task, checklist, subtasks, attachments, activities, profiles] = await Promise.all([
    getTaskBasic(auth.supabase, id),
    getChecklistItems(auth.supabase, id),
    getSubtasksBasic(auth.supabase, id),
    getAttachments(auth.supabase, id),
    getActivities(auth.supabase, id),
    getCachedAllProfiles(),
  ]);

  if (!task) redirect("/dashboard/tasks");

  // 카운트는 이미 조회된 실제 데이터에서 계산
  task.checklist_total = checklist.length;
  task.checklist_completed = checklist.filter((c) => c.is_completed).length;
  task.subtask_count = subtasks.length;
  task.comment_count = activities.filter((a) => a.type === "comment").length;
  task.attachment_count = attachments.length;

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
