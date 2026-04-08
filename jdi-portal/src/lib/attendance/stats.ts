import type { AttendanceRecord } from "./types";

const DEFAULT_WORK_START = "09:00:00";
const DEFAULT_WORK_END = "18:00:00";

/** ISO timestamp에서 분 단위 시간을 KST 기준으로 추출 */
function extractTimeMinutes(isoString: string): number {
  const date = new Date(isoString);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

/** "HH:MM:SS" 또는 "HH:MM" 문자열을 분 단위로 변환 */
export function timeStringToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

/** 분 단위를 "HH:MM AM/PM" 형식으로 변환 */
export function minutesToTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

/** 한 직원의 근무시간 이력 1행 (stats 계산용 슬림 형) */
export interface WorkScheduleEntry {
  effective_from: string;
  work_start_time: string;
  work_end_time: string;
}

/**
 * 주어진 work_date에 대해 적용되는 근무시간 기준을 반환.
 * schedules는 effective_from ASC 정렬되어 있어야 함.
 * 매칭 행이 없으면 09:00 / 18:00 기본값 반환.
 */
export function getScheduleForDate(
  schedules: WorkScheduleEntry[],
  workDate: string
): { workStart: string; workEnd: string } {
  let match: WorkScheduleEntry | null = null;
  for (const s of schedules) {
    if (s.effective_from <= workDate) match = s;
    else break;
  }
  if (!match) {
    return { workStart: DEFAULT_WORK_START, workEnd: DEFAULT_WORK_END };
  }
  return { workStart: match.work_start_time, workEnd: match.work_end_time };
}

export interface AttendanceStats {
  totalDays: number;
  avgWorkMinutes: number;
  onTimeRate: number;
  avgLateMinutes: number;
  avgCheckInMinutes: number;
  avgCheckOutMinutes: number;
  normalCount: number;
  lateCount: number;
  earlyLeaveCount: number;
}

export const EMPTY_STATS: AttendanceStats = {
  totalDays: 0, avgWorkMinutes: 0, onTimeRate: 0,
  avgLateMinutes: 0, avgCheckInMinutes: 0, avgCheckOutMinutes: 0,
  normalCount: 0, lateCount: 0, earlyLeaveCount: 0,
};

export function calcAttendanceStats(
  records: AttendanceRecord[],
  schedules: WorkScheduleEntry[]
): AttendanceStats {
  const checkedInRecords = records.filter((r) => r.check_in);
  const totalDays = checkedInRecords.length;

  if (totalDays === 0) return { ...EMPTY_STATS };

  let totalWorkMinutes = 0;
  let totalCheckInMinutes = 0;
  let totalCheckOutMinutes = 0;
  let checkOutCount = 0;
  let lateCount = 0;
  let totalLateMinutes = 0;
  let earlyLeaveCount = 0;

  for (const record of checkedInRecords) {
    const { workStart, workEnd } = getScheduleForDate(schedules, record.work_date);
    const workStartMin = timeStringToMinutes(workStart);
    const workEndMin = timeStringToMinutes(workEnd);

    const checkInMin = extractTimeMinutes(record.check_in!);
    totalCheckInMinutes += checkInMin;

    if (checkInMin > workStartMin) {
      lateCount++;
      totalLateMinutes += checkInMin - workStartMin;
    }

    if (record.check_out) {
      const checkOutMin = extractTimeMinutes(record.check_out);
      totalCheckOutMinutes += checkOutMin;
      checkOutCount++;

      if (checkOutMin < workEndMin) {
        earlyLeaveCount++;
      }
    }

    if (record.total_minutes) {
      totalWorkMinutes += record.total_minutes;
    }
  }

  const normalCount = totalDays - lateCount;

  return {
    totalDays,
    avgWorkMinutes: Math.round(totalWorkMinutes / totalDays),
    onTimeRate: Math.round((normalCount / totalDays) * 100),
    avgLateMinutes: lateCount > 0 ? Math.round(totalLateMinutes / lateCount) : 0,
    avgCheckInMinutes: Math.round(totalCheckInMinutes / totalDays),
    avgCheckOutMinutes: checkOutCount > 0 ? Math.round(totalCheckOutMinutes / checkOutCount) : 0,
    normalCount,
    lateCount,
    earlyLeaveCount,
  };
}

/** 요일별 (월~금) 평균 출근 시간 계산 */
export function calcWeekdayAvgCheckIn(records: AttendanceRecord[]): { day: string; avgMinutes: number }[] {
  const weekdays = ["월", "화", "수", "목", "금"];
  const buckets: number[][] = [[], [], [], [], []];

  for (const record of records) {
    if (!record.check_in) continue;
    const date = new Date(`${record.work_date}T12:00:00+09:00`);
    const dow = date.getDay();
    if (dow >= 1 && dow <= 5) {
      buckets[dow - 1].push(extractTimeMinutes(record.check_in));
    }
  }

  return weekdays.map((day, i) => ({
    day,
    avgMinutes: buckets[i].length > 0
      ? Math.round(buckets[i].reduce((a, b) => a + b, 0) / buckets[i].length)
      : 0,
  }));
}

/** 주차별 총 근무시간 계산 */
export function calcWeeklyWorkHours(records: AttendanceRecord[]): { week: string; hours: number }[] {
  const sorted = [...records].sort((a, b) => a.work_date.localeCompare(b.work_date));
  if (sorted.length === 0) return [];

  const weeks: Map<string, number> = new Map();

  for (const record of sorted) {
    const date = new Date(`${record.work_date}T12:00:00+09:00`);
    const dayOfMonth = date.getDate();
    const weekNum = Math.ceil(dayOfMonth / 7);
    const key = `${weekNum}주`;
    const prev = weeks.get(key) ?? 0;
    weeks.set(key, prev + (record.total_minutes ?? 0));
  }

  return Array.from(weeks.entries()).map(([week, minutes]) => ({
    week,
    hours: Math.round((minutes / 60) * 10) / 10,
  }));
}
