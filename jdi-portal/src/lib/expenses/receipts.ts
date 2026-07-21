import { createClient } from "@/lib/supabase/client";
import { validateFile } from "@/lib/utils/upload";

const BUCKET = "expense-receipts";

/** 업로드 성공 시 storage path 반환. 실패 시 한국어 Error throw. */
export async function uploadExpenseReceipt(expenseId: string, file: File): Promise<string> {
  const validationError = validateFile(file);
  if (validationError) throw new Error(validationError);

  const RECEIPT_ALLOWED_EXTS = ["jpg", "jpeg", "png", "webp", "pdf"];
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  if (!RECEIPT_ALLOWED_EXTS.includes(ext)) {
    throw new Error("영수증은 이미지(JPG/PNG/WebP) 또는 PDF만 첨부할 수 있습니다.");
  }

  const supabase = createClient();
  const path = `${expenseId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw new Error(`영수증 업로드에 실패했습니다: ${error.message}`);
  return path;
}

export async function getExpenseReceiptUrl(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw new Error(`영수증 주소를 만들지 못했습니다: ${error.message}`);
  return data?.signedUrl ?? null;
}
