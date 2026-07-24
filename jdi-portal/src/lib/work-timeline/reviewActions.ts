"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  REVIEW_COMMENT_MAX_LENGTH,
  REVIEW_MAX_ATTACHMENTS,
  REVIEW_REMEDIATION_MAX_LENGTH,
} from "./constants";
import type { ReviewRemediationAttachmentInput } from "./types";

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
}

const UUID_ATTACHMENT_PATH =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[^/]+$/i;

/**
 * 작성자가 검토 칸에서 보완(글 + 파일)을 제출한다. open -> submitted 전이는 RPC가 담당.
 * 파일은 클라이언트에서 work-timeline 버킷에 이미 업로드했고, 여기선 메타데이터만 받아 RPC로 저장한다.
 */
export async function submitRemediation(
  entryId: string,
  reviewId: string,
  note: string,
  attachments: ReviewRemediationAttachmentInput[],
): Promise<void> {
  assertUuid(entryId, "업무보고");
  assertUuid(reviewId, "검토");

  const trimmedNote = note.trim();
  if (trimmedNote.length > REVIEW_REMEDIATION_MAX_LENGTH) {
    throw new Error(`보완 내용은 ${REVIEW_REMEDIATION_MAX_LENGTH}자 이하로 입력해 주세요.`);
  }
  const files = attachments ?? [];
  if (!trimmedNote && files.length === 0) {
    throw new Error("보완 내용이나 파일을 올려 주세요.");
  }
  if (files.length > REVIEW_MAX_ATTACHMENTS) {
    throw new Error(`파일은 최대 ${REVIEW_MAX_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
  }
  for (const file of files) {
    if (
      !file.file_name?.trim()
      || file.file_name.length > 255
      || !file.file_path?.trim()
      || !UUID_ATTACHMENT_PATH.test(file.file_path)
      || !Number.isInteger(file.file_size)
      || file.file_size < 0
    ) {
      throw new Error("첨부 정보가 올바르지 않습니다.");
    }
  }

  const { supabase } = await getAuth();
  const { error } = await supabase.rpc("submit_timeline_review_remediation", {
    p_review_id: reviewId,
    p_note: trimmedNote || null,
    p_attachments: files.map((file) => ({
      file_name: file.file_name,
      file_path: file.file_path,
      mime_type: file.mime_type || "application/octet-stream",
      file_size: file.file_size,
    })),
  });
  if (error) throw error;
  revalidatePath(`/dashboard/work-timeline/${entryId}`);
  revalidatePath("/dashboard");
}

export async function approveReview(reviewId: string, note?: string): Promise<void> {
  assertUuid(reviewId, "검토");
  const trimmedNote = note?.trim() || null;
  if (trimmedNote && trimmedNote.length > REVIEW_COMMENT_MAX_LENGTH) {
    throw new Error(`승인 메모는 ${REVIEW_COMMENT_MAX_LENGTH}자 이하로 입력해 주세요.`);
  }
  const { supabase } = await getAuth();
  const { error } = await supabase.rpc("approve_timeline_review", {
    p_review_id: reviewId, p_note: trimmedNote,
  });
  if (error) throw error;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/work-timeline", "layout");
}

export async function rejectReview(reviewId: string, note: string): Promise<void> {
  assertUuid(reviewId, "검토");
  const trimmed = note.trim();
  if (!trimmed) throw new Error("반려 사유를 입력해 주세요.");
  if (trimmed.length > REVIEW_COMMENT_MAX_LENGTH) {
    throw new Error(`반려 사유는 ${REVIEW_COMMENT_MAX_LENGTH}자 이하로 입력해 주세요.`);
  }
  const { supabase } = await getAuth();
  const { error } = await supabase.rpc("reject_timeline_review", {
    p_review_id: reviewId, p_note: trimmed,
  });
  if (error) throw error;
  revalidatePath("/dashboard");
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
