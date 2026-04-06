# 근태관리 기록 탭 확장 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개인 근무시간 설정 기능을 추가하고, 기록 탭을 관리자/직원 공용 UI로 확장하여 직원별 근태 분석이 가능하도록 구현한다.

**Architecture:** 1단계로 profiles 테이블에 work_start_time/work_end_time 컬럼을 추가하고 출퇴근 탭에 설정 UI를 배치한다. 2단계로 기록 탭을 확장하여 직원 목록 + 상세 기록 + 통계 + 차트 구조의 공용 UI를 구현한다. 관리자는 전체 직원을, 일반 직원은 본인만 조회한다.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (RLS), Tailwind CSS 4, recharts, xlsx (SheetJS), phosphor-react

---

## 파일 구조

### 새 파일
| 파일 | 역할 |
|------|------|
| `supabase/migrations/026_work_schedule.sql` | profiles에 work_start_time, work_end_time 추가 |
| `src/components/dashboard/attendance/WorkScheduleCard.tsx` | 근무시간 설정 카드 UI |
| `src/components/dashboard/attendance/tabs/records/AdminRecordsView.tsx` | 기록 탭 메인 레이아웃 (직원목록 + 상세) |
| `src/components/dashboard/attendance/tabs/records/RecordsFilter.tsx` | 상단 필터 (기간, 부서, 검색) |
| `src/components/dashboard/attendance/tabs/records/EmployeeCard.tsx` | 직원 요약 카드 |
| `src/components/dashboard/attendance/tabs/records/RecordsSummaryCards.tsx` | 요약 카드 4개 |
| `src/components/dashboard/attendance/tabs/records/RecordsDetailTable.tsx` | 상세 기록 테이블 (스크롤) |
| `src/components/dashboard/attendance/tabs/records/AttendanceCharts.tsx` | 요일별 출근시간 바차트 + 주간 근무시간 라인차트 |
| `src/lib/attendance/stats.ts` | 통계 계산 유틸 (평균, 지각, 출근률 등) |

### 수정 파일
| 파일 | 변경 내용 |
|------|----------|
| `src/lib/attendance/types.ts` | Profile에 work_start_time, work_end_time 추가 |
| `src/lib/attendance/actions.ts` | updateWorkSchedule 액션 추가 |
| `src/lib/attendance/queries.ts` | getEmployeeRecords, getEmployeeRecordsByRange 추가 |
| `src/components/dashboard/attendance/tabs/CheckInOutTab.tsx` | WorkScheduleCard 배치 |
| `src/components/dashboard/attendance/tabs/RecordsTab.tsx` | 역할 분기 → AdminRecordsView |
| `src/components/dashboard/attendance/AttendancePageClient.tsx` | RecordsTab에 profile/allProfiles 전달 |
| `src/app/dashboard/attendance/page.tsx` | allProfiles를 admin+employee 모두에게 전달 조정 |

---

## Task 1: DB 마이그레이션 — 근무시간 컬럼 추가

**Files:**
- Create: `supabase/migrations/026_work_schedule.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 026_work_schedule.sql
-- 개인별 고정 근무시간 설정 (출근/퇴근 기준 시간)

ALTER TABLE public.profiles
  ADD COLUMN work_start_time TIME DEFAULT NULL,
  ADD COLUMN work_end_time TIME DEFAULT NULL;

COMMENT ON COLUMN public.profiles.work_start_time IS '고정 출근 시간 (NULL이면 09:00 기준)';
COMMENT ON COLUMN public.profiles.work_end_time IS '고정 퇴근 시간 (NULL이면 18:00 기준)';
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `npx supabase db push --linked`
Expected: Migration applied successfully

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/026_work_schedule.sql
git commit -m "DB: profiles 테이블에 work_start_time, work_end_time 컬럼 추가"
```

---

## Task 2: 타입 + 액션 + 쿼리 업데이트

**Files:**
- Modify: `src/lib/attendance/types.ts`
- Modify: `src/lib/attendance/actions.ts`
- Modify: `src/lib/attendance/queries.ts`
- Create: `src/lib/attendance/stats.ts`

- [ ] **Step 1: Profile 타입에 근무시간 필드 추가**

`src/lib/attendance/types.ts`의 Profile 인터페이스에 추가:

```typescript
export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: "employee" | "admin";
  department: string;
  hire_date: string;
  avatar_url?: string | null;
  phone?: string | null;
  bio?: string | null;
  is_approved: boolean;
  work_start_time: string | null;  // "HH:MM:SS" 형식 또는 null
  work_end_time: string | null;    // "HH:MM:SS" 형식 또는 null
}
```

- [ ] **Step 2: 근무시간 설정 액션 추가**

`src/lib/attendance/actions.ts` 하단에 추가:

```typescript
export async function updateWorkSchedule(
  userId: string,
  workStartTime: string | null,
  workEndTime: string | null
) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      work_start_time: workStartTime,
      work_end_time: workEndTime,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("work_start_time, work_end_time")
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 3: 기간별 근태 기록 쿼리 추가**

`src/lib/attendance/queries.ts` 하단에 추가:

```typescript
export async function getEmployeeRecordsByRange(
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("user_id", userId)
    .gte("work_date", startDate)
    .lte("work_date", endDate)
    .order("work_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 4: 통계 계산 유틸 작성**

`src/lib/attendance/stats.ts` 생성:

```typescript
import type { AttendanceRecord } from "./types";

const DEFAULT_WORK_START = "09:00:00";
const DEFAULT_WORK_END = "18:00:00";

/** ISO timestamp에서 "HH:MM" 형식 시간을 KST 기준으로 추출 */
function extractTimeMinutes(isoString: string): number {
  const date = new Date(isoString);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

/** "HH:MM:SS" 또는 "HH:MM" 문자열을 분 단위로 변환 */
function timeStringToMinutes(timeStr: string): number {
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

export interface AttendanceStats {
  totalDays: number;
  avgWorkMinutes: number;
  onTimeRate: number;
  avgLateMinutes: number;
  avgCheckInMinutes: number;   // 평균 출근시간 (분 단위, 0시 기준)
  avgCheckOutMinutes: number;  // 평균 퇴근시간 (분 단위, 0시 기준)
  normalCount: number;
  lateCount: number;
  earlyLeaveCount: number;
}

export function calcAttendanceStats(
  records: AttendanceRecord[],
  workStartTime: string | null,
  workEndTime: string | null
): AttendanceStats {
  const workStart = timeStringToMinutes(workStartTime ?? DEFAULT_WORK_START);
  const workEnd = timeStringToMinutes(workEndTime ?? DEFAULT_WORK_END);

  const checkedInRecords = records.filter((r) => r.check_in);
  const totalDays = checkedInRecords.length;

  if (totalDays === 0) {
    return {
      totalDays: 0,
      avgWorkMinutes: 0,
      onTimeRate: 0,
      avgLateMinutes: 0,
      avgCheckInMinutes: 0,
      avgCheckOutMinutes: 0,
      normalCount: 0,
      lateCount: 0,
      earlyLeaveCount: 0,
    };
  }

  let totalWorkMinutes = 0;
  let totalCheckInMinutes = 0;
  let totalCheckOutMinutes = 0;
  let checkOutCount = 0;
  let lateCount = 0;
  let totalLateMinutes = 0;
  let earlyLeaveCount = 0;

  for (const record of checkedInRecords) {
    const checkInMin = extractTimeMinutes(record.check_in!);
    totalCheckInMinutes += checkInMin;

    if (checkInMin > workStart) {
      lateCount++;
      totalLateMinutes += checkInMin - workStart;
    }

    if (record.check_out) {
      const checkOutMin = extractTimeMinutes(record.check_out);
      totalCheckOutMinutes += checkOutMin;
      checkOutCount++;

      if (checkOutMin < workEnd) {
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
    const dow = date.getDay(); // 0=Sun, 1=Mon...
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

/** 전월 대비 변화량 계산 */
export function calcMonthOverMonth(
  current: AttendanceStats,
  previous: AttendanceStats
): {
  daysDiff: number;
  workTimeDiff: number;
  onTimeRateDiff: number;
  lateTimeDiff: number;
} {
  return {
    daysDiff: current.totalDays - previous.totalDays,
    workTimeDiff: current.avgWorkMinutes - previous.avgWorkMinutes,
    onTimeRateDiff: current.onTimeRate - previous.onTimeRate,
    lateTimeDiff: current.avgLateMinutes - previous.avgLateMinutes,
  };
}
```

- [ ] **Step 5: 커밋**

```bash
git add src/lib/attendance/types.ts src/lib/attendance/actions.ts src/lib/attendance/queries.ts src/lib/attendance/stats.ts
git commit -m "기능 추가: 근무시간 타입/액션/쿼리 + 근태 통계 유틸"
```

---

## Task 3: 근무시간 설정 카드 UI

**Files:**
- Create: `src/components/dashboard/attendance/WorkScheduleCard.tsx`
- Modify: `src/components/dashboard/attendance/tabs/CheckInOutTab.tsx`

- [ ] **Step 1: WorkScheduleCard 컴포넌트 작성**

`src/components/dashboard/attendance/WorkScheduleCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, FloppyDisk } from "phosphor-react";
import { updateWorkSchedule } from "@/lib/attendance/actions";
import { getErrorMessage } from "@/lib/utils/errors";

interface WorkScheduleCardProps {
  userId: string;
  workStartTime: string | null;
  workEndTime: string | null;
}

function timeToInput(time: string | null, fallback: string): string {
  if (!time) return fallback;
  return time.slice(0, 5); // "HH:MM:SS" → "HH:MM"
}

export default function WorkScheduleCard({ userId, workStartTime, workEndTime }: WorkScheduleCardProps) {
  const router = useRouter();
  const [startTime, setStartTime] = useState(timeToInput(workStartTime, "09:00"));
  const [endTime, setEndTime] = useState(timeToInput(workEndTime, "18:00"));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const hasChanges =
    startTime !== timeToInput(workStartTime, "09:00") ||
    endTime !== timeToInput(workEndTime, "18:00");

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await updateWorkSchedule(userId, `${startTime}:00`, `${endTime}:00`);
      setFeedback({ type: "success", message: "근무시간이 저장되었습니다." });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: getErrorMessage(error, "저장에 실패했습니다.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={20} className="text-slate-400" />
        <h3 className="text-base font-bold text-slate-800">내 근무시간</h3>
        {!workStartTime && (
          <span className="text-xs text-slate-400">(기본값)</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 mb-1">출근 시간</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 mb-1">퇴근 시간</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
          />
        </div>
        <div className="pt-5">
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FloppyDisk size={16} />
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: CheckInOutTab에 WorkScheduleCard 배치**

`src/components/dashboard/attendance/tabs/CheckInOutTab.tsx` 전체 교체:

```tsx
"use client";

import CheckInOutCard from "../CheckInOutCard";
import WeekSummaryCard from "../WeekSummaryCard";
import WorkScheduleCard from "../WorkScheduleCard";
import type { AttendanceRecord } from "@/lib/attendance/types";

interface CheckInOutTabProps {
  userId: string;
  todayRecord: AttendanceRecord | null;
  weekRecords: AttendanceRecord[];
  weekStart: string;
  workStartTime: string | null;
  workEndTime: string | null;
}

export default function CheckInOutTab({
  userId,
  todayRecord,
  weekRecords,
  weekStart,
  workStartTime,
  workEndTime,
}: CheckInOutTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CheckInOutCard userId={userId} todayRecord={todayRecord} />
        <WeekSummaryCard weekRecords={weekRecords} weekStart={weekStart} />
      </div>
      <WorkScheduleCard
        userId={userId}
        workStartTime={workStartTime}
        workEndTime={workEndTime}
      />
    </div>
  );
}
```

- [ ] **Step 3: AttendancePageClient에서 CheckInOutTab에 근무시간 props 전달**

`src/components/dashboard/attendance/AttendancePageClient.tsx`에서 CheckInOutTab 호출 부분 수정:

```tsx
{activeTab === "checkin" && (
  <CheckInOutTab
    userId={props.profile.id}
    todayRecord={props.todayRecord}
    weekRecords={props.weekRecords}
    weekStart={props.weekStart}
    workStartTime={props.profile.work_start_time}
    workEndTime={props.profile.work_end_time}
  />
)}
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/attendance/WorkScheduleCard.tsx src/components/dashboard/attendance/tabs/CheckInOutTab.tsx src/components/dashboard/attendance/AttendancePageClient.tsx
git commit -m "기능 추가: 출퇴근 탭에 개인 근무시간 설정 카드"
```

---

## Task 4: 기록 탭 필터 컴포넌트

**Files:**
- Create: `src/components/dashboard/attendance/tabs/records/RecordsFilter.tsx`

- [ ] **Step 1: RecordsFilter 컴포넌트 작성**

```tsx
"use client";

import { useState } from "react";
import { CalendarBlank, MagnifyingGlass, Funnel } from "phosphor-react";

interface RecordsFilterProps {
  startDate: string;
  endDate: string;
  departments: string[];
  selectedDepartment: string;
  searchQuery: string;
  onDateChange: (start: string, end: string) => void;
  onDepartmentChange: (dept: string) => void;
  onSearchChange: (query: string) => void;
  onApply: () => void;
  isAdmin: boolean;
}

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export default function RecordsFilter({
  startDate,
  endDate,
  departments,
  selectedDepartment,
  searchQuery,
  onDateChange,
  onDepartmentChange,
  onSearchChange,
  onApply,
  isAdmin,
}: RecordsFilterProps) {
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);

  const handleQuickRange = (type: "thisMonth" | "lastMonth") => {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    if (type === "lastMonth") {
      month -= 1;
      if (month === 0) { month = 12; year -= 1; }
    }
    const range = getMonthRange(year, month);
    setLocalStart(range.start);
    setLocalEnd(range.end);
    onDateChange(range.start, range.end);
  };

  const handleApply = () => {
    onDateChange(localStart, localEnd);
    onApply();
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        {/* 조회 기간 */}
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 mb-1.5">조회 기간</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <CalendarBlank size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={localStart}
                onChange={(e) => setLocalStart(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
              />
            </div>
            <span className="text-slate-400 text-sm">~</span>
            <input
              type="date"
              value={localEnd}
              onChange={(e) => setLocalEnd(e.target.value)}
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
            />
            <button
              onClick={() => handleQuickRange("thisMonth")}
              className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-brand-600 text-white hover:bg-brand-500 transition-colors whitespace-nowrap"
            >
              이번달
            </button>
            <button
              onClick={() => handleQuickRange("lastMonth")}
              className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              지난달
            </button>
          </div>
        </div>

        {/* 부서 필터 (관리자만) */}
        {isAdmin && (
          <div className="w-full lg:w-40">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">부서</label>
            <div className="relative">
              <Funnel size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={selectedDepartment}
                onChange={(e) => onDepartmentChange(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 appearance-none"
              >
                <option value="">전체 부서</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* 직원 검색 (관리자만) */}
        {isAdmin && (
          <div className="w-full lg:w-48">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">직원 검색</label>
            <div className="relative">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="이름 또는 직책 검색"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
              />
            </div>
          </div>
        )}

        {/* 조회하기 버튼 */}
        <button
          onClick={handleApply}
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-brand-600 hover:bg-brand-500 shadow-lg shadow-brand-500/20 transition-all whitespace-nowrap"
        >
          조회하기
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/dashboard/attendance/tabs/records/RecordsFilter.tsx
git commit -m "기능 추가: 기록 탭 상단 필터 컴포넌트"
```

---

## Task 5: 직원 요약 카드 컴포넌트

**Files:**
- Create: `src/components/dashboard/attendance/tabs/records/EmployeeCard.tsx`

- [ ] **Step 1: EmployeeCard 컴포넌트 작성**

```tsx
"use client";

import type { AttendanceStats } from "@/lib/attendance/stats";
import { minutesToTimeLabel } from "@/lib/attendance/stats";

interface EmployeeCardProps {
  name: string;
  department: string;
  stats: AttendanceStats;
  selected: boolean;
  onClick: () => void;
  avatarColor: string;
}

const AVATAR_COLORS = [
  "bg-red-100 text-red-600",
  "bg-blue-100 text-blue-600",
  "bg-green-100 text-green-600",
  "bg-purple-100 text-purple-600",
  "bg-amber-100 text-amber-600",
  "bg-pink-100 text-pink-600",
  "bg-teal-100 text-teal-600",
];

export function getAvatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export default function EmployeeCard({
  name,
  department,
  stats,
  selected,
  onClick,
  avatarColor,
}: EmployeeCardProps) {
  const initial = name.charAt(0);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl p-4 transition-all duration-200 ${
        selected
          ? "bg-white border-2 border-brand-500 shadow-md"
          : "bg-white/60 border border-slate-100 hover:bg-white hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor}`}>
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div>
              <span className="text-sm font-bold text-slate-800">{name}</span>
              <p className="text-xs text-slate-400">{department}</p>
            </div>
            <div className="flex gap-1">
              {stats.normalCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-50 text-brand-600">
                  정상 {stats.normalCount}
                </span>
              )}
              {stats.lateCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-600">
                  지각 {stats.lateCount}
                </span>
              )}
              {stats.earlyLeaveCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-600">
                  조퇴 {stats.earlyLeaveCount}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-6 mt-2 text-xs text-slate-500">
            <div>
              <span className="text-slate-400">평균 출근</span>
              <p className="font-semibold text-slate-700">
                {stats.totalDays > 0 ? minutesToTimeLabel(stats.avgCheckInMinutes) : "--:--"}
              </p>
            </div>
            <div>
              <span className="text-slate-400">평균 퇴근</span>
              <p className="font-semibold text-slate-700">
                {stats.totalDays > 0 ? minutesToTimeLabel(stats.avgCheckOutMinutes) : "--:--"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/dashboard/attendance/tabs/records/EmployeeCard.tsx
git commit -m "기능 추가: 직원 요약 카드 컴포넌트"
```

---

## Task 6: 요약 카드 4개 컴포넌트

**Files:**
- Create: `src/components/dashboard/attendance/tabs/records/RecordsSummaryCards.tsx`

- [ ] **Step 1: RecordsSummaryCards 컴포넌트 작성**

```tsx
"use client";

import { Briefcase, ClockAfternoon, CheckCircle, Warning } from "phosphor-react";
import type { AttendanceStats } from "@/lib/attendance/stats";
import { formatMinutes } from "@/lib/utils/date";

interface RecordsSummaryCardsProps {
  stats: AttendanceStats;
  prevStats: AttendanceStats | null;
}

export default function RecordsSummaryCards({ stats, prevStats }: RecordsSummaryCardsProps) {
  const daysDiff = prevStats ? stats.totalDays - prevStats.totalDays : null;
  const onTimeRateDiff = prevStats ? stats.onTimeRate - prevStats.onTimeRate : null;
  const lateTimeDiff = prevStats ? stats.avgLateMinutes - prevStats.avgLateMinutes : null;

  const cards = [
    {
      label: "총 근무일수",
      value: `${stats.totalDays}`,
      unit: "일",
      diff: daysDiff !== null ? `전월 대비 ${Math.abs(daysDiff)}건 ${daysDiff >= 0 ? "증가" : "감소"}` : null,
      diffPositive: daysDiff !== null ? daysDiff >= 0 : null,
      icon: Briefcase,
      iconColor: "text-brand-500",
    },
    {
      label: "평균 근무시간",
      value: formatMinutes(stats.avgWorkMinutes).replace("시간", "h").replace("분", "m"),
      unit: "",
      diff: null,
      diffPositive: null,
      icon: ClockAfternoon,
      iconColor: "text-emerald-500",
    },
    {
      label: "정상 출근률",
      value: `${stats.onTimeRate}`,
      unit: "%",
      diff: onTimeRateDiff !== null ? `전월 대비 ${Math.abs(onTimeRateDiff)}% ${onTimeRateDiff >= 0 ? "증가" : "감소"}` : null,
      diffPositive: onTimeRateDiff !== null ? onTimeRateDiff >= 0 : null,
      icon: CheckCircle,
      iconColor: "text-blue-500",
    },
    {
      label: "평균 지각시간",
      value: `${stats.avgLateMinutes}`,
      unit: "분",
      diff: lateTimeDiff !== null && lateTimeDiff !== 0
        ? `전월 대비 ${Math.abs(lateTimeDiff)}분 ${lateTimeDiff > 0 ? "증가" : "감소"}`
        : lateTimeDiff === 0 ? "기존 대비 영수" : null,
      diffPositive: lateTimeDiff !== null ? lateTimeDiff <= 0 : null,
      icon: Warning,
      iconColor: "text-amber-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">{card.label}</span>
              <Icon size={18} className={card.iconColor} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-slate-800">{card.value}</span>
              {card.unit && <span className="text-sm text-slate-500">{card.unit}</span>}
            </div>
            {card.diff && (
              <p className={`text-xs mt-1 ${card.diffPositive ? "text-brand-600" : "text-red-500"}`}>
                {card.diffPositive ? "▲" : "▼"} {card.diff}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/dashboard/attendance/tabs/records/RecordsSummaryCards.tsx
git commit -m "기능 추가: 근태 통계 요약 카드 4개"
```

---

## Task 7: 상세 기록 테이블 + 엑셀 다운로드

**Files:**
- Create: `src/components/dashboard/attendance/tabs/records/RecordsDetailTable.tsx`

- [ ] **Step 1: npm install xlsx**

Run: `npm install xlsx`

- [ ] **Step 2: RecordsDetailTable 컴포넌트 작성**

```tsx
"use client";

import { DownloadSimple } from "phosphor-react";
import { formatDate, formatTime, formatMinutes } from "@/lib/utils/date";
import type { AttendanceRecord } from "@/lib/attendance/types";
import * as XLSX from "xlsx";

interface RecordsDetailTableProps {
  records: AttendanceRecord[];
  employeeName: string;
  periodLabel: string;
  workStartTime: string | null;
}

function getRecordStatus(record: AttendanceRecord, workStartMinutes: number): { label: string; color: string } {
  if (!record.check_in) return { label: "미출근", color: "bg-slate-100 text-slate-600" };

  const date = new Date(record.check_in);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const checkInMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  if (checkInMin > workStartMinutes) {
    return { label: "지각", color: "bg-red-50 text-red-600" };
  }
  return { label: "정상", color: "bg-brand-50 text-brand-600" };
}

export default function RecordsDetailTable({
  records,
  employeeName,
  periodLabel,
  workStartTime,
}: RecordsDetailTableProps) {
  const workStartMinutes = workStartTime
    ? Number(workStartTime.split(":")[0]) * 60 + Number(workStartTime.split(":")[1])
    : 540; // 09:00

  const handleExcelDownload = () => {
    const data = records.map((record) => {
      const status = getRecordStatus(record, workStartMinutes);
      return {
        "날짜": record.work_date,
        "출근 시간": formatTime(record.check_in),
        "퇴근 시간": formatTime(record.check_out),
        "근무 시간": formatMinutes(record.total_minutes),
        "상태": status.label,
        "비고": record.note ?? "-",
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "근태기록");
    XLSX.writeFile(wb, `${employeeName}_근태기록_${periodLabel}.xlsx`);
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-slate-800">
          {employeeName}님의 상세 기록 <span className="text-slate-400 font-normal">{periodLabel}</span>
        </h4>
        <button
          onClick={handleExcelDownload}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
        >
          <DownloadSimple size={14} />
          엑셀 다운로드
        </button>
      </div>

      <div className="max-h-[400px] overflow-y-auto rounded-xl">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">날짜</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">출근 시간</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">퇴근 시간</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">근무 시간</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">상태</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">비고</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-sm text-slate-400">
                  해당 기간의 기록이 없습니다.
                </td>
              </tr>
            ) : (
              records.map((record) => {
                const status = getRecordStatus(record, workStartMinutes);
                return (
                  <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDate(record.work_date)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatTime(record.check_in)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatTime(record.check_out)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatMinutes(record.total_minutes)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{record.note ?? "-"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/dashboard/attendance/tabs/records/RecordsDetailTable.tsx package.json package-lock.json
git commit -m "기능 추가: 상세 기록 테이블 + 엑셀 다운로드"
```

---

## Task 8: 차트 컴포넌트 (recharts)

**Files:**
- Create: `src/components/dashboard/attendance/tabs/records/AttendanceCharts.tsx`

- [ ] **Step 1: npm install recharts**

Run: `npm install recharts`

- [ ] **Step 2: AttendanceCharts 컴포넌트 작성**

```tsx
"use client";

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ChartBar, TrendUp } from "phosphor-react";
import type { AttendanceRecord } from "@/lib/attendance/types";
import { calcWeekdayAvgCheckIn, calcWeeklyWorkHours, minutesToTimeLabel } from "@/lib/attendance/stats";

interface AttendanceChartsProps {
  records: AttendanceRecord[];
}

export default function AttendanceCharts({ records }: AttendanceChartsProps) {
  const weekdayData = calcWeekdayAvgCheckIn(records);
  const weeklyData = calcWeeklyWorkHours(records);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 요일별 평균 출근 시간 */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <ChartBar size={18} className="text-slate-400" />
          <h4 className="text-sm font-bold text-slate-800">요일별 평균 출근 시간</h4>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdayData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <YAxis
                domain={[480, 600]}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickFormatter={(v: number) => minutesToTimeLabel(v)}
              />
              <Tooltip
                formatter={(value: number) => [minutesToTimeLabel(value), "평균 출근"]}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
              />
              <Bar dataKey="avgMinutes" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 주간 근무시간 추이 */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendUp size={18} className="text-slate-400" />
          <h4 className="text-sm font-bold text-slate-800">주간 근무시간 추이</h4>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} unit="h" />
              <Tooltip
                formatter={(value: number) => [`${value}h`, "근무시간"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="hours"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ fill: "#6366f1", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/dashboard/attendance/tabs/records/AttendanceCharts.tsx package.json package-lock.json
git commit -m "기능 추가: 요일별 출근시간 바차트 + 주간 근무시간 라인차트"
```

---

## Task 9: 메인 레이아웃 — AdminRecordsView

**Files:**
- Create: `src/components/dashboard/attendance/tabs/records/AdminRecordsView.tsx`

- [ ] **Step 1: AdminRecordsView 컴포넌트 작성**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Users } from "phosphor-react";
import { createClient } from "@/lib/supabase/client";
import { calcAttendanceStats } from "@/lib/attendance/stats";
import type { AttendanceRecord, Profile } from "@/lib/attendance/types";
import RecordsFilter from "./RecordsFilter";
import EmployeeCard, { getAvatarColor } from "./EmployeeCard";
import RecordsSummaryCards from "./RecordsSummaryCards";
import RecordsDetailTable from "./RecordsDetailTable";
import AttendanceCharts from "./AttendanceCharts";
import type { AttendanceStats } from "@/lib/attendance/stats";

interface AdminRecordsViewProps {
  profile: Profile;
  allProfiles: Profile[];
}

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export default function AdminRecordsView({ profile, allProfiles }: AdminRecordsViewProps) {
  const isAdmin = profile.role === "admin";
  const now = new Date();
  const currentRange = getMonthRange(now.getFullYear(), now.getMonth() + 1);

  // 필터 상태
  const [startDate, setStartDate] = useState(currentRange.start);
  const [endDate, setEndDate] = useState(currentRange.end);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // 직원/데이터 상태
  const profiles = isAdmin ? allProfiles : [profile];
  const [selectedUserId, setSelectedUserId] = useState(profile.id);
  const [employeeRecords, setEmployeeRecords] = useState<Map<string, AttendanceRecord[]>>(new Map());
  const [employeeStats, setEmployeeStats] = useState<Map<string, AttendanceStats>>(new Map());
  const [prevStats, setPrevStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);

  const detailRef = useRef<HTMLDivElement>(null);

  // 부서 목록
  const departments = [...new Set(allProfiles.map((p) => p.department).filter(Boolean))];

  // 필터된 프로필
  const filteredProfiles = profiles.filter((p) => {
    if (selectedDepartment && p.department !== selectedDepartment) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!p.full_name.toLowerCase().includes(q) && !p.department.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // 전체 직원 기록 fetch
  const fetchAllRecords = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const newRecords = new Map<string, AttendanceRecord[]>();
    const newStats = new Map<string, AttendanceStats>();

    const targetProfiles = isAdmin ? allProfiles : [profile];

    const promises = targetProfiles.map(async (p) => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("user_id", p.id)
        .gte("work_date", startDate)
        .lte("work_date", endDate)
        .order("work_date", { ascending: false });

      if (!error && data) {
        newRecords.set(p.id, data);
        newStats.set(p.id, calcAttendanceStats(data, p.work_start_time, p.work_end_time));
      }
    });

    await Promise.all(promises);
    setEmployeeRecords(newRecords);
    setEmployeeStats(newStats);
    setLoading(false);
  }, [startDate, endDate, allProfiles, profile, isAdmin]);

  // 전월 통계 fetch
  const fetchPrevStats = useCallback(async () => {
    const supabase = createClient();
    const startParts = startDate.split("-");
    let prevYear = Number(startParts[0]);
    let prevMonth = Number(startParts[1]) - 1;
    if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }
    const prevRange = getMonthRange(prevYear, prevMonth);

    const selectedProfile = allProfiles.find((p) => p.id === selectedUserId) ?? profile;

    const { data } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("user_id", selectedUserId)
      .gte("work_date", prevRange.start)
      .lte("work_date", prevRange.end);

    if (data) {
      setPrevStats(calcAttendanceStats(data, selectedProfile.work_start_time, selectedProfile.work_end_time));
    }
  }, [selectedUserId, startDate, allProfiles, profile]);

  useEffect(() => {
    fetchAllRecords();
  }, [fetchAllRecords]);

  useEffect(() => {
    fetchPrevStats();
  }, [fetchPrevStats]);

  const selectedProfile = allProfiles.find((p) => p.id === selectedUserId) ?? profile;
  const selectedRecords = employeeRecords.get(selectedUserId) ?? [];
  const selectedStats = employeeStats.get(selectedUserId) ?? calcAttendanceStats([], null, null);

  const handleEmployeeSelect = (userId: string) => {
    setSelectedUserId(userId);
    // 모바일에서 상세 영역으로 스크롤
    if (window.innerWidth < 1024 && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const periodLabel = `${startDate.replace(/-/g, ".")} ~ ${endDate.replace(/-/g, ".")}`;

  return (
    <div className="space-y-6">
      <RecordsFilter
        startDate={startDate}
        endDate={endDate}
        departments={departments}
        selectedDepartment={selectedDepartment}
        searchQuery={searchQuery}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
        onDepartmentChange={setSelectedDepartment}
        onSearchChange={setSearchQuery}
        onApply={fetchAllRecords}
        isAdmin={isAdmin}
      />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* 왼쪽: 직원 목록 */}
        <div className="w-full lg:w-[380px] shrink-0">
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-slate-400" />
                <h4 className="text-sm font-bold text-slate-800">직원 요약</h4>
                <span className="text-xs font-semibold text-brand-600">{filteredProfiles.length}명</span>
              </div>
              {isAdmin && (
                <span className="text-xs text-slate-400">전체 선택</span>
              )}
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse rounded-2xl bg-slate-100 h-24" />
                ))}
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {filteredProfiles.map((p, index) => (
                  <EmployeeCard
                    key={p.id}
                    name={p.full_name}
                    department={p.department}
                    stats={employeeStats.get(p.id) ?? calcAttendanceStats([], null, null)}
                    selected={p.id === selectedUserId}
                    onClick={() => handleEmployeeSelect(p.id)}
                    avatarColor={getAvatarColor(index)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽: 상세 기록 */}
        <div ref={detailRef} className="flex-1 space-y-6 min-w-0">
          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse glass-card rounded-2xl h-28" />
                ))}
              </div>
              <div className="animate-pulse glass-card rounded-2xl h-64" />
            </div>
          ) : (
            <>
              <RecordsSummaryCards stats={selectedStats} prevStats={prevStats} />
              <RecordsDetailTable
                records={selectedRecords}
                employeeName={selectedProfile.full_name}
                periodLabel={periodLabel}
                workStartTime={selectedProfile.work_start_time}
              />
              <AttendanceCharts records={selectedRecords} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/dashboard/attendance/tabs/records/AdminRecordsView.tsx
git commit -m "기능 추가: 기록 탭 메인 레이아웃 (직원목록 + 상세 + 통계)"
```

---

## Task 10: RecordsTab 역할 분기 + page.tsx 연결

**Files:**
- Modify: `src/components/dashboard/attendance/tabs/RecordsTab.tsx`
- Modify: `src/components/dashboard/attendance/AttendancePageClient.tsx`
- Modify: `src/app/dashboard/attendance/page.tsx`

- [ ] **Step 1: RecordsTab에 역할 분기 추가**

`src/components/dashboard/attendance/tabs/RecordsTab.tsx` — 상단 import 추가 및 props에 profile/allProfiles 추가. role이 있으면 AdminRecordsView를, 아니면 기존 UI를 표시:

기존 RecordsTab 인터페이스와 컴포넌트를 수정:

```tsx
"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ClockCounterClockwise, Plus } from "phosphor-react";
import AttendanceCalendar from "../AttendanceCalendar";
import AttendanceTable from "../AttendanceTable";
import CorrectionRequestModal from "../CorrectionRequestModal";
import AdminRecordsView from "./records/AdminRecordsView";
import { formatDate, formatTime } from "@/lib/utils/date";
import type { AttendanceRecord, CorrectionRequest, Profile } from "@/lib/attendance/types";

const CORRECTION_STATUS_STYLE: Record<string, string> = {
  "대기중": "bg-amber-50 text-amber-600",
  "승인": "bg-emerald-50 text-emerald-600",
  "반려": "bg-red-50 text-red-600",
};

interface RecordsTabProps {
  userId: string;
  monthRecords: AttendanceRecord[];
  correctionRequests: CorrectionRequest[];
  currentYear: number;
  currentMonth: number;
  profile: Profile;
  allProfiles: Profile[];
}

export default function RecordsTab({ userId, monthRecords, correctionRequests, currentYear, currentMonth, profile, allProfiles }: RecordsTabProps) {
  // 새 AdminRecordsView를 사용 — 관리자/직원 모두 동일한 UI
  return (
    <AdminRecordsView
      profile={profile}
      allProfiles={allProfiles.length > 0 ? allProfiles : [profile]}
    />
  );
}
```

> Note: 기존 캘린더+테이블 UI는 AdminRecordsView의 상세 기록 테이블로 대체됩니다. 기존 정정 요청 이력은 현재 "관리" 탭에서 관리되므로 기록 탭에서는 제거합니다.

- [ ] **Step 2: AttendancePageClient에서 RecordsTab에 profile 전달**

`src/components/dashboard/attendance/AttendancePageClient.tsx` — RecordsTab 호출 부분 수정:

```tsx
{activeTab === "records" && (
  <RecordsTab
    userId={props.profile.id}
    monthRecords={props.monthRecords}
    correctionRequests={props.correctionRequests}
    currentYear={props.currentYear}
    currentMonth={props.currentMonth}
    profile={props.profile}
    allProfiles={props.allProfiles ?? []}
  />
)}
```

- [ ] **Step 3: page.tsx에서 일반 직원에게도 allProfiles 전달**

`src/app/dashboard/attendance/page.tsx` — 일반 직원의 경우에도 빈 배열 대신 처리하도록. allProfiles는 이미 admin 분기에서 fetch하지만, employee의 경우 RecordsTab에서 `[profile]`로 fallback하므로 변경 불필요. 현재 코드 유지.

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/attendance/tabs/RecordsTab.tsx src/components/dashboard/attendance/AttendancePageClient.tsx
git commit -m "기능 추가: 기록 탭 역할 분기 — 관리자/직원 공용 UI 연결"
```

---

## Task 11: 최종 빌드 검증 + lint

- [ ] **Step 1: lint 실행**

Run: `npm run lint`
Expected: 에러 없음

- [ ] **Step 2: 빌드 실행**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 에러 수정 (있을 경우)**

빌드/lint 에러가 있으면 수정하고 다시 확인.

- [ ] **Step 4: 최종 커밋**

```bash
git add -A
git commit -m "기능 추가: 근태관리 기록 탭 확장 — 관리자/직원 공용 UI + 근무시간 설정"
```
