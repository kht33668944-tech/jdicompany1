export function formatKRW(n: number, options: { dashOnZero?: boolean } = {}): string {
  if (n === 0 && options.dashOnZero) return "—";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return `${n.toLocaleString()}원`;
}
