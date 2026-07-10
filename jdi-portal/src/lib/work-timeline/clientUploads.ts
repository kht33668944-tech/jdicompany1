"use client";

import { createClient } from "@/lib/supabase/client";
import {
  cleanupWorkTimelineStoragePaths,
  finalizeWorkTimelineAttachments,
} from "./actions";
import { WORK_TIMELINE_BUCKET } from "./constants";
import type {
  WorkTimelineAttachment,
  WorkTimelineAttachmentInput,
  WorkTimelineImageUpload,
} from "./types";
import { getFileExtension, validateWorkTimelineImage } from "./utils";

interface DirectUploadOptions {
  entryId: string;
  userId: string;
  images: WorkTimelineImageUpload[];
  positions: number[];
}

async function cleanupUploadedPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await cleanupWorkTimelineStoragePaths(paths);
  } catch (error) {
    console.error("업무 타임라인 업로드 롤백을 정리 대기열에 기록하지 못했습니다.", { paths, error });
  }
}

export async function uploadWorkTimelineImagesDirect({
  entryId,
  userId,
  images,
  positions,
}: DirectUploadOptions): Promise<WorkTimelineAttachment[]> {
  if (images.length !== positions.length) throw new Error("첨부 이미지 순서가 올바르지 않습니다.");
  const supabase = createClient();
  const uploadedPaths: string[] = [];
  const metadata: WorkTimelineAttachmentInput[] = [];

  try {
    for (let index = 0; index < images.length; index += 1) {
      const { file, thumbnail = null } = images[index];
      const position = positions[index];
      validateWorkTimelineImage(file);
      if (thumbnail) validateWorkTimelineImage(thumbnail);

      const uniqueId = crypto.randomUUID();
      const basePath = `${userId}/${entryId}/${uniqueId}`;
      const filePath = `${basePath}.${getFileExtension(file)}`;
      const thumbnailPath = thumbnail
        ? `${basePath}_thumb.${getFileExtension(thumbnail)}`
        : null;

      const { error: fileError } = await supabase.storage
        .from(WORK_TIMELINE_BUCKET)
        .upload(filePath, file, { contentType: file.type, upsert: false });
      if (fileError) throw fileError;
      uploadedPaths.push(filePath);

      if (thumbnail && thumbnailPath) {
        const { error: thumbnailError } = await supabase.storage
          .from(WORK_TIMELINE_BUCKET)
          .upload(thumbnailPath, thumbnail, { contentType: thumbnail.type, upsert: false });
        if (thumbnailError) throw thumbnailError;
        uploadedPaths.push(thumbnailPath);
      }

      metadata.push({
        fileName: file.name,
        filePath,
        thumbnailPath,
        mimeType: file.type,
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
