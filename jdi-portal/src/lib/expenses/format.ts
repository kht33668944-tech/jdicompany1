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

/**
 * 사용자 입력 금액 문자열에서 숫자만 뽑아 원(정수)으로 변환한다.
 * "33,000원"·"33000 원"·" 33000 " 같이 쉼표/공백/"원"·기타 글자가 섞여도 안전하게 파싱한다.
 * 유효한 숫자가 없으면 NaN을 반환한다(호출부에서 검증 처리).
 */
export function parseKrwInput(value: string): number {
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === ".") return NaN;
  return Math.round(Number(cleaned));
}

/**
 * 외화(소수 허용) 입력 문자열에서 숫자만 뽑아 변환한다. "$100.5"·"100.5 USD" 등 허용.
 * 유효한 숫자가 없으면 NaN을 반환한다.
 */
export function parseForeignInput(value: string): number {
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === ".") return NaN;
  return Number(cleaned);
}
