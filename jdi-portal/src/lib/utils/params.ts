export function getSingleValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseYearParam(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : fallback;
}

export function parseMonthParam(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : fallback;
}
