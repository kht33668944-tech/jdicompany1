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

/**
 * 분류별 카드 색상 (아주 연한 배경 + 점 컬러).
 * 분류 이름을 키로 사용 — Tailwind JIT가 감지하도록 클래스는 반드시 리터럴 문자열로 둔다.
 */
export interface CategoryStyle {
  /** 카드 배경 + 테두리 */
  card: string;
  /** 분류명 앞 점 색 */
  dot: string;
}

export const CATEGORY_STYLE: Record<string, CategoryStyle> = {
  세금: { card: "bg-rose-50/70 border-rose-100", dot: "bg-rose-400" },
  급여: { card: "bg-pink-50/70 border-pink-100", dot: "bg-pink-400" },
  공과금: { card: "bg-amber-50/70 border-amber-100", dot: "bg-amber-400" },
  "임차료·관리비": { card: "bg-violet-50/70 border-violet-100", dot: "bg-violet-400" },
  "구독·소프트웨어": { card: "bg-blue-50/70 border-blue-100", dot: "bg-blue-400" },
  광고비: { card: "bg-indigo-50/70 border-indigo-100", dot: "bg-indigo-400" },
  "물류·배송": { card: "bg-sky-50/70 border-sky-100", dot: "bg-sky-400" },
  "비품·소모품": { card: "bg-teal-50/70 border-teal-100", dot: "bg-teal-400" },
  "식비·복리후생": { card: "bg-orange-50/70 border-orange-100", dot: "bg-orange-400" },
  기타: { card: "bg-slate-50/80 border-slate-200", dot: "bg-slate-300" },
};

export const CATEGORY_STYLE_FALLBACK: CategoryStyle = {
  card: "bg-white/65 border-white/80",
  dot: "bg-slate-300",
};
