/**
 * 분류(카테고리) 색상 팔레트.
 * ⚠️ Tailwind JIT 감지를 위해 클래스는 반드시 리터럴 문자열로 둔다. (동적 조합 금지)
 * color_key 는 expense_categories.color_key 에 저장되며, UI 는 categoryStyle 로 조회한다.
 */
export interface CategoryStyle {
  /** 카드 배경 + 테두리 */
  card: string;
  /** 분류명 앞 점 색 */
  dot: string;
}

const PALETTE: Record<string, CategoryStyle> = {
  violet: { card: "bg-violet-50/70 border-violet-100", dot: "bg-violet-400" },
  blue: { card: "bg-blue-50/70 border-blue-100", dot: "bg-blue-400" },
  indigo: { card: "bg-indigo-50/70 border-indigo-100", dot: "bg-indigo-400" },
  sky: { card: "bg-sky-50/70 border-sky-100", dot: "bg-sky-400" },
  teal: { card: "bg-teal-50/70 border-teal-100", dot: "bg-teal-400" },
  emerald: { card: "bg-emerald-50/70 border-emerald-100", dot: "bg-emerald-400" },
  amber: { card: "bg-amber-50/70 border-amber-100", dot: "bg-amber-400" },
  orange: { card: "bg-orange-50/70 border-orange-100", dot: "bg-orange-400" },
  rose: { card: "bg-rose-50/70 border-rose-100", dot: "bg-rose-400" },
  pink: { card: "bg-pink-50/70 border-pink-100", dot: "bg-pink-400" },
  cyan: { card: "bg-cyan-50/70 border-cyan-100", dot: "bg-cyan-400" },
  lime: { card: "bg-lime-50/70 border-lime-100", dot: "bg-lime-400" },
  fuchsia: { card: "bg-fuchsia-50/70 border-fuchsia-100", dot: "bg-fuchsia-400" },
};

const FALLBACK: CategoryStyle = { card: "bg-slate-50/80 border-slate-200", dot: "bg-slate-300" };

/**
 * 자동 배정 순서 = PALETTE 선언 순서 (자주 쓰는 색을 앞쪽에 선언).
 * ⚠️ 099 마이그레이션의 SQL backfill 배열은 별도 순서(emerald 시작)이므로 여기와 일치하지 않아도 된다.
 */
export const COLOR_KEYS = Object.keys(PALETTE) as readonly string[];

export function categoryStyle(colorKey: string | null | undefined): CategoryStyle {
  if (!colorKey) return FALLBACK;
  return PALETTE[colorKey] ?? FALLBACK;
}

/** 아직 안 쓰인 첫 색키. 모두 쓰였으면 개수 기준으로 순환. */
export function pickNextColorKey(usedKeys: string[]): string {
  const used = new Set(usedKeys);
  for (const key of COLOR_KEYS) {
    if (!used.has(key)) return key;
  }
  return COLOR_KEYS[usedKeys.length % COLOR_KEYS.length];
}
