import { getKoreanWeekday } from "@/lib/utils/date";

/** 마감일을 "오늘 (금)" / "08.03 (월)" 형태로. 마감일이 없으면 fallbackText. */
export function formatDueWithWeekday(dueDate: string | null, fallbackText: string, today: string): string {
  if (!dueDate) return fallbackText;
  const [, month, day] = dueDate.split("-");
  const weekday = getKoreanWeekday(dueDate);
  if (dueDate === today) return `오늘 (${weekday})`;
  return `${month}.${day} (${weekday})`;
}
