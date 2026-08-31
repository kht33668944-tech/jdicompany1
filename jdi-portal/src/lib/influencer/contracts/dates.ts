// TMA 계약 날짜 계산 — 순수 함수만 둔다(정적 테스트가 직접 import 해 실행).
// today 는 호출부에서 toDateString(kstNow()) 로 주입한다(KST 기준, 테스트 가능성 확보).

export type DateUrgency = "overdue" | "soon" | null;

function parts(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split("-").map(Number);
  return [y, m, d];
}

/** 두 날짜 문자열("YYYY-MM-DD")의 일수 차이 (a - b) */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

/**
 * 개월 더하기(월말 클램핑). 예: 2025-08-31 +6개월 → 2026-02-28 (2월 31일이 없으므로 말일로).
 * date + interval 을 그대로 쓰면 월말이 다음 달로 넘칠 수 있어 명시 구현한다.
 */
export function addMonthsClamped(dateStr: string, months: number): string {
  const [y, m, d] = parts(dateStr);
  const total = m - 1 + months;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12; // 음수 개월도 안전하게
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/**
 * 게시 유지 종료일 = 실제 게시일 + 3개월. 게시 전이면 null.
 * "3개월" 규칙의 단일 소스 — 정적 테스트가 이 파일을 값 import 없이 직접 실행하므로
 * 상수 파일로 빼지 않고 여기에 둔다.
 *
 * 2026-08-21 곽억배 협의로 6개월 → 3개월로 바뀌었다. 계약서 문안(documents/)과
 * 이 계산이 어긋나면 화면에 뜨는 종료일이 계약서와 달라지므로 함께 고친다.
 * 갑의 2차 활용 기간(2개월)과는 성격이 다른 별개 값이다.
 */
export function getRetentionEnd(postActualDate: string | null): string | null {
  if (!postActualDate) return null;
  return addMonthsClamped(postActualDate, 3);
}

/** 날짜 임박/지남 판정. 지났으면 overdue, soonDays 이내면 soon. */
export function getDateUrgency(
  dateStr: string | null,
  today: string,
  soonDays: number,
): DateUrgency {
  if (!dateStr) return null;
  const diff = dayDiff(dateStr, today);
  if (diff < 0) return "overdue";
  if (diff <= soonDays) return "soon";
  return null;
}

/** 게시월 필터 키("YYYY-MM"). 실제 게시일이 있으면 그것, 없으면 게시 예정일 기준. */
export function getPostMonth(
  postActualDate: string | null,
  postPlannedDate: string | null,
): string | null {
  const base = postActualDate ?? postPlannedDate;
  return base ? base.slice(0, 7) : null;
}

/** "YYYY-MM" → "2026년 12월" */
export function formatPostMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}년 ${m}월`;
}
