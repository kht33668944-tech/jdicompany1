/**
 * 금액을 한국식 축약으로 표시한다.
 * - `dashOnZero`: 0원을 "—" 로 (비용 미입력 칸)
 * - `withWon`: 억/만 뒤에도 "원" 을 붙인다 ("1.2억원", "35만원")
 */
export function formatKRW(
  n: number,
  options: { dashOnZero?: boolean; withWon?: boolean } = {},
): string {
  if (n === 0 && options.dashOnZero) return "—";
  const won = options.withWon ? "원" : "";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억${won}`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만${won}`;
  return `${n.toLocaleString()}원`;
}
