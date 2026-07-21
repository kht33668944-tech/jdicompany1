import type { ExpenseSource } from "./types";

/** 결제수단 자유 입력 + 자주 쓰는 값 제안 (datalist용) */
export const PAYMENT_METHOD_SUGGESTIONS: string[] = [
  "기업은행 법인계좌이체",
  "기업은행 법인카드",
  "신한 광고비카드",
  "법인카드",
  "기타",
];

export const EXPENSE_SOURCE_LABEL: Record<ExpenseSource, string> = {
  manual: "직접 입력",
  recurring: "고정 지출",
  import: "잔디 이관",
};
