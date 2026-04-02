const APP_TIME_ZONE = "Asia/Seoul";
const WEEKDAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function getDateParts(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function parseDateString(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

function getWeekdayIndex(dateStr: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
  }).format(new Date(`${dateStr}T12:00:00+09:00`));

  return WEEKDAY_ORDER.indexOf(weekday as (typeof WEEKDAY_ORDER)[number]);
}

export function addDays(dateStr: string, amount: number): string {
  const { year, month, day } = parseDateString(dateStr);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

export function getWeekRange(date: Date = new Date()) {
  const today = toDateString(date);
  const weekday = getWeekdayIndex(today);
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;

  return {
    start: addDays(today, diffToMonday),
    end: addDays(today, diffToMonday + 4),
  };
}

export function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function formatTime(isoString: string | null): string {
  if (!isoString) return "--:--";
  return new Date(isoString).toLocaleTimeString("ko-KR", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return "0시간 0분";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}시간 ${m}분`;
}

export function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00+09:00`).toLocaleDateString("ko-KR", {
    timeZone: APP_TIME_ZONE,
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function formatDateFull(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00+09:00`).toLocaleDateString("ko-KR", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export function getKoreanWeekday(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00+09:00`).toLocaleDateString("ko-KR", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
  });
}

export function isWeekend(dateStr: string): boolean {
  const day = getWeekdayIndex(dateStr);
  return day === 0 || day === 6;
}

export function toDateString(date: Date = new Date()): string {
  const { year, month, day } = getDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function toDateStringFromTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const { year, month, day } = getDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getHourFromTimestamp(isoString: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hour: "numeric",
    hour12: false,
  }).format(new Date(isoString));
  return Number(hour);
}

export function getFirstDayOfMonth(year: number, month: number): number {
  return getWeekdayIndex(`${year}-${String(month).padStart(2, "0")}-01`);
}
