import { createClient } from "@/lib/supabase/client";
import { validateFile } from "@/lib/utils/upload";
import { VAULT_BUCKET } from "./constants";

export interface UploadedFileMeta {
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/** 서류 파일 업로드(브라우저). 성공 시 저장 메타 반환, 실패 시 한국어 Error throw. */
export async function uploadVaultFile(corporationId: string, file: File): Promise<UploadedFileMeta> {
  const validationError = validateFile(file);
  if (validationError) throw new Error(validationError);

  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${corporationId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(VAULT_BUCKET).upload(storagePath, file);
  if (error) throw new Error(`파일 업로드에 실패했습니다: ${error.message}`);

  return {
    storagePath,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

/** 단일 파일 서명 URL(1시간). */
export async function getVaultSignedUrl(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(VAULT_BUCKET).createSignedUrl(path, 3600);
  if (error) throw new Error(`파일 주소를 만들지 못했습니다: ${error.message}`);
  return data?.signedUrl ?? null;
}

/** 여러 파일 서명 URL(다중 다운로드용). 경로별 {path, url}. */
export async function getVaultSignedUrls(
  paths: string[],
): Promise<{ path: string; url: string }[]> {
  if (paths.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(VAULT_BUCKET).createSignedUrls(paths, 3600);
  if (error) throw new Error(`파일 주소를 만들지 못했습니다: ${error.message}`);
  const out: { path: string; url: string }[] = [];
  for (const d of data ?? []) {
    if (d.signedUrl && d.path) out.push({ path: d.path, url: d.signedUrl });
  }
  return out;
}
