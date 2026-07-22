export type ExpenseCurrency = "KRW" | "USD";
export type ExpenseSource = "manual" | "recurring" | "import";

export interface ExpenseCategory {
  id: string;
  name: string;
  is_sensitive: boolean;
  sort_order: number;
  is_active: boolean;
  color_key: string | null;
}

export interface PaymentMethod {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  expense_date: string; // "YYYY-MM-DD"
  vendor: string | null;
  description: string;
  amount_krw: number;
  currency: ExpenseCurrency;
  amount_foreign: number | null;
  payment_method: string;
  category_id: string;
  receipt_path: string | null;
  source: ExpenseSource;
  recurring_id: string | null;
  amount_pending: boolean;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseWithMeta extends Expense {
  category: ExpenseCategory | null;
  author_profile: { full_name: string } | null;
}

export interface ExpenseInput {
  expense_date: string;
  vendor: string | null;
  description: string;
  amount_krw: number;
  currency: ExpenseCurrency;
  amount_foreign: number | null;
  payment_method: string;
  category_id: string;
}

export interface RecurringExpense {
  id: string;
  name: string;
  vendor: string | null;
  amount_krw: number;
  currency: ExpenseCurrency;
  amount_foreign: number | null;
  billing_day: number;
  payment_method: string;
  category_id: string;
  owner_id: string;
  is_active: boolean;
  is_variable: boolean;
  note: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RecurringExpenseWithMeta extends RecurringExpense {
  category: ExpenseCategory | null;
  owner_profile: { full_name: string } | null;
}

/** 고정지출 항목의 최근 자동 기록 이력 한 건 */
export interface RecurringHistoryItem {
  id: string;
  expense_date: string;
  amount_krw: number;
  currency: ExpenseCurrency;
  amount_foreign: number | null;
}

export interface RecurringInput {
  name: string;
  vendor: string | null;
  amount_krw: number;
  currency: ExpenseCurrency;
  amount_foreign: number | null;
  billing_day: number;
  payment_method: string;
  category_id: string;
  owner_id: string;
  is_variable: boolean;
  note: string | null;
}
