import { createClient } from "@/lib/supabase/server";
import type { WorkTimelineReviewWithEvents } from "./types";

// 상세 화면·인박스에서 쓰는 단건 검토 조회. RLS로 당사자/관리자만 조회 가능.
export async function getEntryReview(
  entryId: string,
): Promise<WorkTimelineReviewWithEvents | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_timeline_reviews")
    .select(
      `id, entry_id, reviewer_id, author_id, task_id, comment, state,
       created_at, resolved_at, updated_at,
       reviewer:profiles!work_timeline_reviews_reviewer_id_fkey(full_name),
       author:profiles!work_timeline_reviews_author_id_fkey(full_name),
       task:tasks(status),
       events:work_timeline_review_events(
         id, review_id, actor_id, kind, note, created_at,
         actor:profiles!work_timeline_review_events_actor_id_fkey(full_name)
       )`,
    )
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "work_timeline_review_events", ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    id: string; entry_id: string; reviewer_id: string; author_id: string;
    task_id: string | null; comment: string; state: WorkTimelineReviewWithEvents["state"];
    created_at: string; resolved_at: string | null; updated_at: string;
    reviewer: { full_name: string | null } | null;
    author: { full_name: string | null } | null;
    task: { status: string } | null;
    events: Array<{
      id: string; review_id: string; actor_id: string;
      kind: WorkTimelineReviewWithEvents["events"][number]["kind"];
      note: string | null; created_at: string;
      actor: { full_name: string | null } | null;
    }>;
  };

  return {
    id: row.id, entry_id: row.entry_id, reviewer_id: row.reviewer_id, author_id: row.author_id,
    task_id: row.task_id, comment: row.comment, state: row.state,
    created_at: row.created_at, resolved_at: row.resolved_at, updated_at: row.updated_at,
    reviewer_name: row.reviewer?.full_name ?? null,
    author_name: row.author?.full_name ?? null,
    task_status: row.task?.status ?? null,
    events: (row.events ?? []).map((e) => ({
      id: e.id, review_id: e.review_id, actor_id: e.actor_id,
      actor_name: e.actor?.full_name ?? null, kind: e.kind, note: e.note, created_at: e.created_at,
    })),
  };
}
