import type { VacationType } from "@/lib/attendance/types";

const VACATION_LABELS = new Map<string, string>([
  ["?곗감", "연차"],
  ["?怨쀪컧", "연차"],
  ["諛섏감-?ㅼ쟾", "반차 (오전)"],
  ["獄쏆꼷媛???쇱읈", "반차 (오전)"],
  ["諛섏감-?ㅽ썑", "반차 (오후)"],
  ["獄쏆꼷媛???쎌뜎", "반차 (오후)"],
  ["蹂묎?", "병가"],
  ["癰귣쵌?", "병가"],
  ["?밸퀎?닿?", "기타 휴가"],
  ["?諛명???", "기타 휴가"],
]);

export function calculateVacationDays(hireDate: string, year: number): number {
  const hire = new Date(hireDate);
  const yearsWorked = year - hire.getFullYear();

  if (yearsWorked < 1) {
    const endOfYear = new Date(year, 11, 31);
    let months =
      (endOfYear.getFullYear() - hire.getFullYear()) * 12 +
      (endOfYear.getMonth() - hire.getMonth());
    if (months < 0) months = 0;
    return Math.min(months, 11);
  }

  return Math.min(15 + Math.floor((yearsWorked - 1) / 2), 25);
}

export function getVacationTypeLabel(type: VacationType): string {
  return VACATION_LABELS.get(type) ?? "휴가";
}

export function getVacationDaysCount(type: VacationType, startDate: string, endDate: string): number {
  if (
    type === ("諛섏감-?ㅼ쟾" as VacationType) ||
    type === ("諛섏감-?ㅽ썑" as VacationType) ||
    type === ("獄쏆꼷媛???쇱읈" as VacationType) ||
    type === ("獄쏆꼷媛???쎌뜎" as VacationType)
  ) {
    return 0.5;
  }

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(diffDays, 1);
}
