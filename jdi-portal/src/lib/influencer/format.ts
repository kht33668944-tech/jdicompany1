/** 조회수·좋아요 같은 큰 수를 만/천 단위로 줄여 표시. 값이 없으면 "—". */
export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`;
  return String(Math.round(n));
}

export function formatKRW(n: number, options: { dashOnZero?: boolean } = {}): string {
  if (n === 0 && options.dashOnZero) return "—";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return `${n.toLocaleString()}원`;
}
