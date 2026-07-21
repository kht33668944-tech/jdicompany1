import { createClient } from "@/lib/supabase/client";
import { validateFile } from "@/lib/utils/upload";

const BUCKET = "expense-receipts";

/** 업로드 성공 시 storage path 반환. 실패 시 한국어 Error throw. */
export async function uploadExpenseReceipt(expenseId: string, file: File): Promise<string> {
  const validationError = validateFile(file);
  if (validationError) throw new Error(validationError);

  const supabase = createClient();
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${expenseId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw new Error(`영수증 업로드에 실패했습니다: ${error.message}`);
  return path;
}

export async function getExpenseReceiptUrl(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
