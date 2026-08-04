"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  REVIEW_COMMENT_MAX_LENGTH,
  REVIEW_MAX_ATTACHMENTS,
  REVIEW_REMEDIATION_MAX_LENGTH,
} from "./constants";
import type { ReviewRemediationAttachmentInput } from "./types";
import { assertUuid } from "./utils";

async function getAuth() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: data.user.id };
}

/**
 * 검토를 요청한다. 방향(지시형/확인요청형)은 서버(RPC)가 auth.uid() 와 업무보고 작성자를
 * 비교해 스스로 판정한다 — 클라이언트가 모드를 고르지 않는다 (마이그레이션 118).
 *
 * @param reviewerId 내 업무보고를 남에게 확인 요청할 때 지정하는 검토자.
 *                   관리자가 남의 업무보고에 보완을 지시할 때는 null.
 */
export async function requestReview(
  entryId: string,
  comment: string,
  reviewerId?: string | null,
): Promise<void> {
  assertUuid(entryId, "업무보고");
  if (reviewerId) assertUuid(reviewerId, "검토받을 사람");
  const trimmed = comment.trim();
  if (trimmed.length > REVIEW_COMMENT_MAX_LENGTH) {
    throw new Error(`검토 의견은 ${REVIEW_COMMENT_MAX_LENGTH}자 이하로 입력해 주세요.`);
  }
  // 지시형은 의견이 필수다. 확인요청형(검토자 지정)은 비워 두면 RPC 가 기본 문구를 채운다.
  if (!reviewerId && !trimmed) throw new Error("검토 의견을 입력해 주세요.");
  const { supabase } = await getAuth();
  const { error } = await supabase.rpc("request_timeline_review", {
    p_entry_id: entryId, p_comment: trimmed, p_reviewer_id: reviewerId ?? null,
  });
  if (error) throw error;
  revalidatePath(`/dashboard/work-timeline/${entryId}`);
  revalidatePath("/dashboard");
}

/**
 * 검토 보완 첨부 경로는 `{본인 userId}/{entryId}/{파일명}` 이어야 한다.
 * (work-timeline/actions.ts 의 validateAttachmentInput 과 같은 규칙)
 */
function assertOwnedAttachmentPath(filePath: string, userId: string, entryId: string): void {
  const segments = filePath.split("/");
  if (segments.length !== 3) throw new Error("첨부 정보가 올바르지 않습니다.");
  const [ownerId, pathEntryId, fileName] = segments;
  if (ownerId !== userId || pathEntryId !== entryId || !fileName) {
    throw new Error("첨부 파일 경로가 올바르지 않습니다.");
  }
}

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
  const { supabase, userId } = await getAuth();

  for (const file of files) {
    if (
      !file.file_name?.trim()
      || file.file_name.length > 255
      || !file.file_path?.trim()
      || !Number.isInteger(file.file_size)
      || file.file_size < 0
    ) {
      throw new Error("첨부 정보가 올바르지 않습니다.");
    }
    // 남의 파일 경로를 자기 보완 자료로 등록하지 못하게 소유자·업무보고를 확인한다.
    assertOwnedAttachmentPath(file.file_path, userId, entryId);
  }
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
