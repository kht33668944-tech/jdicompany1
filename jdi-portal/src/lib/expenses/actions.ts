"use server";

import { createClient } from "@/lib/supabase/server";
import type { ExpenseInput, RecurringInput } from "./types";

async function getSessionUserId() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: session.user.id };
}

function validateExpenseInput(input: ExpenseInput) {
  if (!input.expense_date) throw new Error("날짜를 입력해주세요.");
  if (!input.description.trim()) throw new Error("내용을 입력해주세요.");
  if (!Number.isFinite(input.amount_krw) || input.amount_krw <= 0 || !Number.isInteger(input.amount_krw))
    throw new Error("금액(원)을 올바르게 입력해주세요.");
  if (!input.payment_method.trim()) throw new Error("결제수단을 입력해주세요.");
  if (!input.category_id) throw new Error("분류를 선택해주세요.");
  if (input.currency === "USD" && (input.amount_foreign == null || input.amount_foreign <= 0))
    throw new Error("달러 금액을 입력해주세요.");
}

export async function createExpense(input: ExpenseInput) {
  const { supabase, userId } = await getSessionUserId();
  validateExpenseInput(input);
  const { data, error } = await supabase
    .from("expenses")
    .insert({ ...input, source: "manual", created_by: userId })
    .select()
    .single();
  if (error) throw new Error(`지출 저장에 실패했습니다: ${error.message}`);
  return data;
}

export async function updateExpense(id: string, input: ExpenseInput) {
  const { supabase, userId } = await getSessionUserId();
  validateExpenseInput(input);
  const { error } = await supabase
    .from("expenses")
    .update({ ...input, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`지출 수정에 실패했습니다: ${error.message}`);
}

export async function deleteExpense(id: string) {
  const { supabase } = await getSessionUserId();
  const { data: row, error: readError } = await supabase
    .from("expenses")
    .select("receipt_path")
    .eq("id", id)
    .single();
  if (readError) throw new Error(`지출 조회에 실패했습니다: ${readError.message}`);

  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw new Error(`지출 삭제에 실패했습니다: ${error.message}`);

  if (row?.receipt_path) {
    await supabase.storage.from("expense-receipts").remove([row.receipt_path]).catch(() => {});
  }
}

export async function setExpenseReceipt(id: string, path: string | null) {
  const { supabase, userId } = await getSessionUserId();
  const { error } = await supabase
    .from("expenses")
    .update({ receipt_path: path, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`영수증 저장에 실패했습니다: ${error.message}`);
}

function validateRecurringInput(input: RecurringInput) {
  if (!input.name.trim()) throw new Error("이름을 입력해주세요.");
  if (!Number.isFinite(input.amount_krw) || input.amount_krw <= 0 || !Number.isInteger(input.amount_krw))
    throw new Error("금액(원)을 올바르게 입력해주세요.");
  if (input.billing_day < 1 || input.billing_day > 31)
    throw new Error("결제일은 1~31 사이여야 합니다.");
  if (!input.payment_method.trim()) throw new Error("결제수단을 입력해주세요.");
  if (!input.category_id) throw new Error("분류를 선택해주세요.");
  if (!input.owner_id) throw new Error("담당자를 선택해주세요.");
}

export async function createRecurringExpense(input: RecurringInput) {
  const { supabase, userId } = await getSessionUserId();
  validateRecurringInput(input);
  const { data, error } = await supabase
    .from("recurring_expenses")
    .insert({ ...input, created_by: userId })
    .select()
    .single();
  if (error) throw new Error(`고정 지출 저장에 실패했습니다: ${error.message}`);
  return data;
}

export async function updateRecurringExpense(id: string, input: RecurringInput) {
  const { supabase } = await getSessionUserId();
  validateRecurringInput(input);
  const { error } = await supabase
    .from("recurring_expenses")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`고정 지출 수정에 실패했습니다: ${error.message}`);
}

export async function setRecurringActive(id: string, active: boolean) {
  const { supabase } = await getSessionUserId();
  const { error } = await supabase
    .from("recurring_expenses")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`상태 변경에 실패했습니다: ${error.message}`);
}

export async function deleteRecurringExpense(id: string) {
  const { supabase } = await getSessionUserId();
  const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
  if (error) throw new Error(`고정 지출 삭제에 실패했습니다: ${error.message}`);
}
