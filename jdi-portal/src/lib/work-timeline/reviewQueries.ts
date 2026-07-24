import { createClient } from "@/lib/supabase/server";
import { getWorkTimelineSignedUrls } from "./actions";
import type {
  WorkTimelineReviewAttachment,
  WorkTimelineReviewWithEvents,
} from "./types";

// 상세 화면·인박스에서 쓰는 단건 검토 조회. RLS로 당사자/관리자만 조회 가능.
export async function getEntryReview(
  entryId: string,
): Promise<WorkTimelineReviewWithEvents | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_timeline_reviews")
    .select(
      `id, entry_id, reviewer_id, author_id, comment, state,
       created_at, resolved_at, updated_at,
       reviewer:profiles!work_timeline_reviews_reviewer_id_fkey(full_name),
       author:profiles!work_timeline_reviews_author_id_fkey(full_name),
       events:work_timeline_review_events(
         id, review_id, actor_id, kind, note, created_at,
         actor:profiles!work_timeline_review_events_actor_id_fkey(full_name),
         attachments:work_timeline_review_attachments(
           id, event_id, file_name, file_path, mime_type, file_size
         )
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
    comment: string; state: WorkTimelineReviewWithEvents["state"];
    created_at: string; resolved_at: string | null; updated_at: string;
    reviewer: { full_name: string | null } | null;
    author: { full_name: string | null } | null;
    events: Array<{
      id: string; review_id: string; actor_id: string;
      kind: WorkTimelineReviewWithEvents["events"][number]["kind"];
      note: string | null; created_at: string;
      actor: { full_name: string | null } | null;
      attachments: Array<{
        id: string; event_id: string; file_name: string;
        file_path: string; mime_type: string; file_size: number;
      }> | null;
    }>;
  };

  // 첨부 서명 URL 발급 (work-timeline 버킷 재사용). 실패해도 조회는 계속하고 url=null.
  const allPaths = row.events.flatMap((event) =>
    (event.attachments ?? []).map((attachment) => attachment.file_path),
  );
  let signedUrls: Record<string, string> = {};
  if (allPaths.length > 0) {
    try {
      signedUrls = await getWorkTimelineSignedUrls(allPaths);
    } catch (signError) {
      console.warn("검토 첨부의 서명 URL 발급에 실패했습니다.", signError);
    }
  }

  return {
    id: row.id, entry_id: row.entry_id, reviewer_id: row.reviewer_id, author_id: row.author_id,
    comment: row.comment, state: row.state,
    created_at: row.created_at, resolved_at: row.resolved_at, updated_at: row.updated_at,
    reviewer_name: row.reviewer?.full_name ?? null,
    author_name: row.author?.full_name ?? null,
    events: (row.events ?? []).map((event) => ({
      id: event.id, review_id: event.review_id, actor_id: event.actor_id,
      actor_name: event.actor?.full_name ?? null, kind: event.kind,
      note: event.note, created_at: event.created_at,
      attachments: (event.attachments ?? []).map<WorkTimelineReviewAttachment>((attachment) => ({
        id: attachment.id,
        event_id: attachment.event_id,
        file_name: attachment.file_name,
        file_path: attachment.file_path,
        mime_type: attachment.mime_type,
        file_size: attachment.file_size,
        url: signedUrls[attachment.file_path] ?? null,
      })),
    })),
  };
}
