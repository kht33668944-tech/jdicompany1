"use server";

import { createClient } from "@/lib/supabase/server";
import { pickNextColorKey } from "./colors";
import type { ExpenseInput, RecurringInput } from "./types";

async function getSessionUserId() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: session.user.id };
}

export async function createPaymentMethod(name: string) {
  const { supabase, userId } = await getSessionUserId();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("결제수단 이름을 입력해주세요.");
  const { error } = await supabase
    .from("payment_methods")
    .insert({ name: trimmed, created_by: userId });
  if (error) {
    if (error.code === "23505") throw new Error("이미 등록된 결제수단입니다.");
    throw new Error(`결제수단 추가에 실패했습니다: ${error.message}`);
  }
}

export async function deletePaymentMethod(id: string) {
  const { supabase } = await getSessionUserId();
  const { error } = await supabase.from("payment_methods").delete().eq("id", id);
  if (error) throw new Error(`결제수단 삭제에 실패했습니다: ${error.message}`);
}

/**
 * 지출 분류 추가 (승인 직원 누구나, 비민감 분류만).
 * 같은 이름이 소프트 삭제(is_active=false)된 상태로 남아 있으면 재활성화한다.
 */
export async function createExpenseCategory(name: string) {
  const { supabase, userId } = await getSessionUserId();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("분류 이름을 입력해주세요.");

  // 현재 쓰이는 색키 조회 → 안 쓰인 색 자동 배정 (UNIQUE(name) 이므로 소프트 삭제분도 함께 조회)
  const { data: all, error: listError } = await supabase
    .from("expense_categories")
    .select("id, name, is_active, is_sensitive, color_key");
  if (listError) throw new Error(`분류 확인에 실패했습니다: ${listError.message}`);

  const usedKeys = (all ?? []).map((c) => c.color_key).filter((k): k is string => !!k);
  const nextKey = pickNextColorKey(usedKeys);

  const existing = (all ?? []).find((c) => c.name === trimmed);
  if (existing) {
    if (existing.is_sensitive || existing.is_active) {
      throw new Error("이미 등록된 분류입니다.");
    }
    // 숨겨졌던 비민감 분류 → 다시 활성화 (색이 없으면 이때 배정)
    const { error } = await supabase
      .from("expense_categories")
      .update({ is_active: true, color_key: existing.color_key ?? nextKey })
      .eq("id", existing.id);
    if (error) throw new Error(`분류 추가에 실패했습니다: ${error.message}`);
    return;
  }

  const { error } = await supabase
    .from("expense_categories")
    .insert({ name: trimmed, is_sensitive: false, sort_order: 50, color_key: nextKey, created_by: userId });
  if (error) {
    if (error.code === "23505") throw new Error("이미 등록된 분류입니다.");
    throw new Error(`분류 추가에 실패했습니다: ${error.message}`);
  }
}

/**
 * 지출 분류 삭제 = 소프트 삭제(is_active=false).
 * 기존 지출/고정지출이 category_id 로 참조하므로 하드 삭제하지 않고 목록에서만 숨긴다.
 */
export async function deleteExpenseCategory(id: string) {
  const { supabase } = await getSessionUserId();
  const { error } = await supabase
    .from("expense_categories")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw new Error(`분류 삭제에 실패했습니다: ${error.message}`);
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

  if (row?.receipt_path) {
    await supabase.storage.from("expense-receipts").remove([row.receipt_path]).catch(() => {});
  }

  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw new Error(`지출 삭제에 실패했습니다: ${error.message}`);
}

export async function setExpenseReceipt(id: string, path: string | null) {
  const { supabase, userId } = await getSessionUserId();
  const { data: prev, error: prevError } = await supabase
    .from("expenses")
    .select("receipt_path")
    .eq("id", id)
    .single();
  if (prevError) throw new Error(`지출 조회에 실패했습니다: ${prevError.message}`);

  const { error } = await supabase
    .from("expenses")
    .update({ receipt_path: path, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`영수증 저장에 실패했습니다: ${error.message}`);

  if (prev?.receipt_path && prev.receipt_path !== path) {
    await supabase.storage.from("expense-receipts").remove([prev.receipt_path]).catch(() => {});
  }
}

function validateRecurringInput(input: RecurringInput) {
  if (!input.name.trim()) throw new Error("이름을 입력해주세요.");
  if (!input.is_variable) {
    if (!Number.isFinite(input.amount_krw) || input.amount_krw <= 0 || !Number.isInteger(input.amount_krw))
      throw new Error("금액(원)을 올바르게 입력해주세요.");
  } else {
    // 변동성: 예상 금액은 선택(0 또는 양의 정수 허용)
    if (!Number.isFinite(input.amount_krw) || input.amount_krw < 0 || !Number.isInteger(input.amount_krw))
      throw new Error("예상 금액을 올바르게 입력해주세요.");
  }
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

/** 변동성 자동 기록(미확정) 지출의 이번 달 실제 금액을 확정한다. 승인 직원 누구나 가능(RLS로 보호). */
export async function confirmExpenseAmount(id: string, amountKrw: number) {
  const { supabase, userId } = await getSessionUserId();
  if (!Number.isFinite(amountKrw) || amountKrw <= 0 || !Number.isInteger(amountKrw))
    throw new Error("금액(원)을 올바르게 입력해주세요.");
  const { error } = await supabase
    .from("expenses")
    .update({
      amount_krw: amountKrw,
      amount_foreign: null,
      amount_pending: false,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`금액 확정에 실패했습니다: ${error.message}`);
}
