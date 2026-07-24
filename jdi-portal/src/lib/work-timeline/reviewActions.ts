"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { REVIEW_COMMENT_MAX_LENGTH } from "./constants";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getAuth() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: data.user.id };
}
function assertUuid(v: string, label: string) {
  if (!UUID_PATTERN.test(v)) throw new Error(`${label} 값이 올바르지 않습니다.`);
}

export async function requestReview(entryId: string, comment: string): Promise<void> {
  assertUuid(entryId, "업무보고");
  const trimmed = comment.trim();
  if (!trimmed) throw new Error("검토 의견을 입력해 주세요.");
  if (trimmed.length > REVIEW_COMMENT_MAX_LENGTH) {
    throw new Error(`검토 의견은 ${REVIEW_COMMENT_MAX_LENGTH}자 이하로 입력해 주세요.`);
  }
  const { supabase } = await getAuth();
  const { error } = await supabase.rpc("request_timeline_review", {
    p_entry_id: entryId, p_comment: trimmed,
  });
  if (error) throw error;
  revalidatePath(`/dashboard/work-timeline/${entryId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
}

export async function approveReview(reviewId: string, note?: string): Promise<void> {
  assertUuid(reviewId, "검토");
  const { supabase } = await getAuth();
  const { error } = await supabase.rpc("approve_timeline_review", {
    p_review_id: reviewId, p_note: note?.trim() || null,
  });
  if (error) throw error;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/work-timeline", "layout");
}

export async function rejectReview(reviewId: string, note: string): Promise<void> {
  assertUuid(reviewId, "검토");
  const trimmed = note.trim();
  if (!trimmed) throw new Error("반려 사유를 입력해 주세요.");
  const { supabase } = await getAuth();
  const { error } = await supabase.rpc("reject_timeline_review", {
    p_review_id: reviewId, p_note: trimmed,
  });
  if (error) throw error;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/work-timeline", "layout");
}

export async function cancelReview(reviewId: string): Promise<void> {
  assertUuid(reviewId, "검토");
  const { supabase } = await getAuth();
  const { error } = await supabase.rpc("cancel_timeline_review", { p_review_id: reviewId });
  if (error) throw error;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/work-timeline", "layout");
}
