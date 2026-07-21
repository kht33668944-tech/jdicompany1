import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpenseCategory, ExpenseWithMeta, PaymentMethod, RecurringExpenseWithMeta } from "./types";

const EXPENSE_SELECT = `*,
  category:expense_categories(id, name, is_sensitive, sort_order, is_active),
  author_profile:profiles!expenses_created_by_fkey(full_name)`;

export async function getExpenseCategories(supabase: SupabaseClient): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase
    .from("expense_categories")
    .select("id, name, is_sensitive, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ExpenseCategory[];
}

export async function getExpensesByRange(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<ExpenseWithMeta[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_SELECT)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ExpenseWithMeta[];
}

export async function getRangeKrwTotal(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<number> {
  const { data, error } = await supabase
    .from("expenses")
    .select("amount_krw")
    .gte("expense_date", startDate)
    .lte("expense_date", endDate);
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.amount_krw), 0);
}

/** 공용 결제수단 목록 (드롭다운 선택/추가용) */
export async function getPaymentMethods(supabase: SupabaseClient): Promise<PaymentMethod[]> {
  const { data, error } = await supabase
    .from("payment_methods")
    .select("id, name")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PaymentMethod[];
}

export async function getRecurringExpenses(
  supabase: SupabaseClient
): Promise<RecurringExpenseWithMeta[]> {
  const { data, error } = await supabase
    .from("recurring_expenses")
    .select(`*,
      category:expense_categories(id, name, is_sensitive, sort_order, is_active),
      owner_profile:profiles!recurring_expenses_owner_id_fkey(full_name)`)
    .order("is_active", { ascending: false })
    .order("billing_day", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as RecurringExpenseWithMeta[];
}
