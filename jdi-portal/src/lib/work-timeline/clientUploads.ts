"use client";

import { createClient } from "@/lib/supabase/client";
import {
  cleanupWorkTimelineStoragePaths,
  finalizeWorkTimelineAttachments,
} from "./actions";
import { WORK_TIMELINE_BUCKET } from "./constants";
import type {
  ReviewRemediationAttachmentInput,
  WorkTimelineAttachment,
  WorkTimelineAttachmentInput,
  WorkTimelineFileUpload,
} from "./types";
import { getFileExtension, validateWorkTimelineFile } from "./utils";

interface DirectUploadOptions {
  entryId: string;
  userId: string;
  files: WorkTimelineFileUpload[];
  positions: number[];
}

const FALLBACK_MIME = "application/octet-stream";

async function cleanupUploadedPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await cleanupWorkTimelineStoragePaths(paths);
  } catch (error) {
    console.error("업무 타임라인 업로드 롤백을 정리 대기열에 기록하지 못했습니다.", { paths, error });
  }
}

export async function uploadWorkTimelineFilesDirect({
  entryId,
  userId,
  files,
  positions,
}: DirectUploadOptions): Promise<WorkTimelineAttachment[]> {
  if (files.length !== positions.length) throw new Error("첨부 파일 순서가 올바르지 않습니다.");
  const supabase = createClient();
  const uploadedPaths: string[] = [];
  const metadata: WorkTimelineAttachmentInput[] = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      const { file, thumbnail = null } = files[index];
      const position = positions[index];
      validateWorkTimelineFile(file);

      const uniqueId = crypto.randomUUID();
      const basePath = `${userId}/${entryId}/${uniqueId}`;
      const filePath = `${basePath}.${getFileExtension(file)}`;
      const thumbnailPath = thumbnail
        ? `${basePath}_thumb.${getFileExtension(thumbnail)}`
        : null;
      const contentType = file.type || FALLBACK_MIME;

      const { error: fileError } = await supabase.storage
        .from(WORK_TIMELINE_BUCKET)
        .upload(filePath, file, { contentType, upsert: false });
      if (fileError) throw fileError;
      uploadedPaths.push(filePath);

      if (thumbnail && thumbnailPath) {
        const { error: thumbnailError } = await supabase.storage
          .from(WORK_TIMELINE_BUCKET)
          .upload(thumbnailPath, thumbnail, { contentType: thumbnail.type || FALLBACK_MIME, upsert: false });
        if (thumbnailError) throw thumbnailError;
        uploadedPaths.push(thumbnailPath);
      }

      metadata.push({
        fileName: file.name,
        filePath,
        thumbnailPath,
        mimeType: contentType,
        fileSize: file.size,
        position,
      });
    }

    return await finalizeWorkTimelineAttachments(entryId, metadata);
  } catch (error) {
    await cleanupUploadedPaths(uploadedPaths);
    throw error;
  }
}

interface ReviewUploadOptions {
  entryId: string;
  userId: string;
  files: File[];
}

/**
 * 검토 보완 첨부를 work-timeline 버킷에 직접 업로드하고 메타데이터를 돌려준다.
 * 경로는 기존 업무 타임라인과 같은 규약 `{userId}/{entryId}/{uuid}.ext` 를 쓴다.
 * 보완 제출자는 항상 업무보고 작성자(=버킷 소유자)이므로 스토리지 INSERT RLS(083)를 그대로 통과한다.
 * 실제 첨부 행 저장은 서버 액션(submit_timeline_review_remediation RPC)이 담당한다.
 * 업로드 도중 실패하면 이미 올린 파일을 정리한다.
 */
export async function uploadReviewFilesDirect({
  entryId,
  userId,
  files,
}: ReviewUploadOptions): Promise<ReviewRemediationAttachmentInput[]> {
  const supabase = createClient();
  const uploadedPaths: string[] = [];
  const metadata: ReviewRemediationAttachmentInput[] = [];

  try {
    for (const file of files) {
      validateWorkTimelineFile(file);
      const uniqueId = crypto.randomUUID();
      const filePath = `${userId}/${entryId}/${uniqueId}.${getFileExtension(file)}`;
      const contentType = file.type || FALLBACK_MIME;

      const { error: fileError } = await supabase.storage
        .from(WORK_TIMELINE_BUCKET)
        .upload(filePath, file, { contentType, upsert: false });
      if (fileError) throw fileError;
      uploadedPaths.push(filePath);

      metadata.push({
        file_name: file.name,
        file_path: filePath,
        mime_type: contentType,
        file_size: file.size,
      });
    }
    return metadata;
  } catch (error) {
    await cleanupUploadedPaths(uploadedPaths);
    throw error;
  }
}

/** 서버 액션 실패 등으로 업로드한 검토 첨부를 되돌려야 할 때 사용. */
export async function cleanupReviewUploads(paths: string[]): Promise<void> {
  await cleanupUploadedPaths(paths);
}
