import { getDaysInMonth } from "@/lib/utils/date";
import type { RecurringExpenseWithMeta } from "./types";

/**
 * 해당 월의 실제 결제일. 말일을 초과하는 billing_day(예: 31)는 그 달 말일로 클램프한다.
 * ⚠️ 서버 SQL `process_recurring_expenses`의 `LEAST(billing_day, 말일)` 규칙과 반드시 일치해야 한다.
 * 규칙이 바뀌면 이 함수와 해당 마이그레이션을 함께 수정할 것.
 */
export function effectiveBillingDay(billingDay: number, year: number, month: number): number {
  return Math.min(billingDay, getDaysInMonth(year, month));
}

export type RecurringStatus = "recorded" | "upcoming" | "overdue";

/**
 * 활성 고정지출의 이번 달 기록 상태.
 * - recorded: 이번 달 자동 기록됨
 * - upcoming: 아직 결제일 전(예정)
 * - overdue: 결제일이 지났는데 기록 없음(미기록)
 * 비활성 항목은 null.
 */
export function recurringStatus(
  row: RecurringExpenseWithMeta,
  recordedIds: Set<string>,
  cur: { year: number; month: number; day: number }
): RecurringStatus | null {
  if (!row.is_active) return null;
  if (recordedIds.has(row.id)) return "recorded";
  const billDay = effectiveBillingDay(row.billing_day, cur.year, cur.month);
  return billDay >= cur.day ? "upcoming" : "overdue";
}
