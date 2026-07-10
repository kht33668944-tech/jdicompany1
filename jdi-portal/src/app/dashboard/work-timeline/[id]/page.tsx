import { redirect } from "next/navigation";
import WorkTimelineDetailClient from "@/components/dashboard/work-timeline/WorkTimelineDetailClient";
import { getAuthUser } from "@/lib/supabase/auth";
import { getWorkTimelineEntryById } from "@/lib/work-timeline/queries";

interface WorkTimelineDetailPageProps {
  params: Promise<{ id: string }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function WorkTimelineDetailPage({ params }: WorkTimelineDetailPageProps) {
  const { id } = await params;
  const auth = await getAuthUser();
  if (!auth) redirect("/login");
  if (!UUID_PATTERN.test(id)) redirect("/dashboard/work-timeline");

  const entry = await getWorkTimelineEntryById(auth.supabase, id);
  if (!entry) redirect("/dashboard/work-timeline");

  return (
    <WorkTimelineDetailClient
      initialEntry={entry}
      currentUserId={auth.user.id}
      currentUserRole={auth.profile.role}
    />
  );
}
