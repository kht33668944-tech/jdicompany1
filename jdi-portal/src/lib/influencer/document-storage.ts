// 인플루언서 서류 파일 업로드(브라우저). vault/storage.ts 와 같은 구조.
import { createClient } from "@/lib/supabase/client";
import { validateFile } from "@/lib/utils/upload";
import type { UploadedFileMeta } from "@/lib/vault/types";
import { SENSITIVE_KINDS, type DocumentKind } from "./contact-types";

export const INFLUENCER_DOC_BUCKET = "influencer-documents";

/**
 * 저장 경로의 2번째 조각을 정한다.
 *
 * ⚠️ 마이그 111 의 Storage 정책이 `split_part(name, '/', 2) <> 'sensitive'` 로
 *    이 조각을 검사한다. 규칙을 바꾸면 정책도 함께 바꿔야 한다.
 */
export function documentFolder(kind: DocumentKind): "sensitive" | "general" {
  return SENSITIVE_KINDS.includes(kind) ? "sensitive" : "general";
}

/** 경로 규칙: {influencer_id}/{general|sensitive}/{uuid}.{ext} */
export async function uploadInfluencerDocumentFile(
  influencerId: string,
  kind: DocumentKind,
  file: File
): Promise<UploadedFileMeta> {
  const validationError = validateFile(file);
  if (validationError) throw new Error(validationError);

  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${influencerId}/${documentFolder(kind)}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(INFLUENCER_DOC_BUCKET).upload(storagePath, file);
  if (error) {
    // 민감 폴더는 잠금이 풀려 있어야 업로드된다(Storage 정책).
    throw new Error(
      `파일 업로드에 실패했습니다: ${error.message}` +
        (documentFolder(kind) === "sensitive"
          ? " (2차 비밀번호가 잠겨 있으면 올릴 수 없습니다)"
          : "")
    );
  }

  return {
    storagePath,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

/** 서버 액션 실패 시 방금 올린 파일 정리(고아 방지). 실패해도 조용히 무시. */
export async function removeInfluencerDocumentFile(path: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(INFLUENCER_DOC_BUCKET).remove([path]).catch(() => {});
}
