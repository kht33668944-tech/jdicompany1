import { redirect } from "next/navigation";
import WorkTimelineDetailClient from "@/components/dashboard/work-timeline/WorkTimelineDetailClient";
import { getAuthUser } from "@/lib/supabase/auth";
import { getWorkTimelineEntryById, getWorkTimelineProfiles } from "@/lib/work-timeline/queries";
import { getEntryReview } from "@/lib/work-timeline/reviewQueries";
import type { WorkTimelineProfile } from "@/lib/work-timeline/types";

interface WorkTimelineDetailPageProps {
  params: Promise<{ id: string }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function WorkTimelineDetailPage({ params }: WorkTimelineDetailPageProps) {
  const { id } = await params;
  const auth = await getAuthUser();
  if (!auth) redirect("/login");
  if (!UUID_PATTERN.test(id)) redirect("/dashboard/work-timeline");

  const [entry, review] = await Promise.all([
    getWorkTimelineEntryById(auth.supabase, id),
    getEntryReview(id),
  ]);
  if (!entry) redirect("/dashboard/work-timeline");

  // 검토받을 사람 선택은 "내 업무보고를 남에게 확인 요청"할 때만 쓴다.
  // 관리자가 남의 보고서를 볼 때는 필요 없으므로 명단을 아예 읽지 않는다.
  let reviewerCandidates: WorkTimelineProfile[] = [];
  if (entry.user_id === auth.user.id) {
    const profiles = await getWorkTimelineProfiles(auth.supabase);
    reviewerCandidates = profiles.filter((profile) => profile.id !== auth.user.id);
  }

  return (
    <WorkTimelineDetailClient
      initialEntry={entry}
      currentUserId={auth.user.id}
      currentUserRole={auth.profile.role}
      initialReview={review}
      reviewerCandidates={reviewerCandidates}
    />
  );
}
