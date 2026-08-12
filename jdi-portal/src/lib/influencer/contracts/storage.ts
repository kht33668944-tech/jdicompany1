// 신분증 파일 업로드(브라우저) — 보관함 storage.ts 패턴.
// 파일 자체는 비공개 버킷에 올라가고, 경로는 upsertSettlement 로 저장한다.

import { createClient } from "@/lib/supabase/client";
import { validateFile } from "@/lib/utils/upload";
import { CONTRACT_DOCS_BUCKET } from "./constants";

export interface UploadedIdCard {
  storagePath: string;
  fileName: string;
}

/** 신분증 파일 업로드. 성공 시 저장 경로/원본 파일명 반환, 실패 시 한국어 Error throw. */
export async function uploadIdCardFile(contractId: string, file: File): Promise<UploadedIdCard> {
  const validationError = validateFile(file);
  if (validationError) throw new Error(validationError);

  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${contractId}/id-card/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(CONTRACT_DOCS_BUCKET).upload(storagePath, file);
  if (error) throw new Error(`파일 업로드에 실패했습니다: ${error.message}`);

  return { storagePath, fileName: file.name };
}

/** 업로드 취소/실패 시 고아 파일 정리. 실패해도 조용히 무시. */
export async function removeIdCardFile(path: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(CONTRACT_DOCS_BUCKET).remove([path]).catch(() => {});
}
