import type { VacationType } from "@/lib/attendance/types";

const VACATION_LABELS: Record<VacationType, string> = {
  "연차": "연차",
  "반차-오전": "반차 (오전)",
  "반차-오후": "반차 (오후)",
  "병가": "병가",
  "특별휴가": "특별휴가",
};

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
  return VACATION_LABELS[type] ?? "휴가";
}

export function getVacationDaysCount(type: VacationType, startDate: string, endDate: string): number {
  if (type === "반차-오전" || type === "반차-오후") return 0.5;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(diffDays, 1);
}
