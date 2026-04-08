import type { VacationType } from "@/lib/attendance/types";

const VACATION_LABELS: Record<VacationType, string> = {
  "연차": "연차",
  "반차-오전": "반차 (오전)",
  "반차-오후": "반차 (오후)",
  "병가": "병가",
  "특별휴가": "특별휴가",
};

export function calculateVacationDays(hireDate: string, _year?: number): number {
  // 오늘(KST) 기준 실제 근속 기간으로 계산
  //   - 1년 미만: 완료된 개월 수, 최대 11일
  //   - 1년 이상: 15 + floor((근속년수 - 1) / 2), 최대 25일
  void _year; // 호환용 파라미터 — 사용 안 함
  const hire = new Date(`${hireDate}T00:00:00+09:00`);
  const today = new Date();
  if (Number.isNaN(hire.getTime()) || hire > today) return 0;

  let totalMonths =
    (today.getFullYear() - hire.getFullYear()) * 12 +
    (today.getMonth() - hire.getMonth());
  if (today.getDate() < hire.getDate()) totalMonths -= 1;
  if (totalMonths < 0) totalMonths = 0;

  const years = Math.floor(totalMonths / 12);

  if (years < 1) {
    return Math.min(totalMonths, 11);
  }
  return Math.min(15 + Math.floor((years - 1) / 2), 25);
}

export function getVacationTypeLabel(type: VacationType): string {
  return VACATION_LABELS[type] ?? "휴가";
}

export function getVacationDaysCount(type: VacationType, startDate: string, endDate: string): number {
  if (type === "반차-오전" || type === "반차-오후") return 0.5;
  const start = new Date(`${startDate}T00:00:00+09:00`);
  const end = new Date(`${endDate}T00:00:00+09:00`);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(diffDays, 1);
}
