import type { ExpenseCurrency } from "./types";

/** 416140 -> "416,140원" */
export function formatKrw(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** (25, "USD") -> "$25" / (100.5, "USD") -> "$100.5" */
export function formatForeign(amount: number, currency: ExpenseCurrency): string {
  if (currency === "USD") return `$${amount.toLocaleString("en-US")}`;
  return formatKrw(amount);
}
