# 근태 기록탭 "지각" 상태 옆 지각 시간 표시

**작성일**: 2026-04-24
**대상 화면**: 근태관리 → 기록 탭 → 상세 기록 테이블

## 배경 / 목적

현재 근태 기록탭의 상세 기록 테이블에서는 출근이 늦었을 때 `지각` 배지만 표시된다. 사용자가 **얼마나** 늦었는지 확인하려면 출근 시간과 근무 시작 시간을 머릿속으로 뺄셈해야 하는 번거로움이 있다.

배지 자체에 지각 시간을 함께 표시하여 한눈에 알 수 있게 한다.

## 범위

### 포함

- `RecordsDetailTable.tsx`의 상태 배지 라벨 수정 (`지각` → `지각 +1h 5m` 등)
- 엑셀 다운로드 시 "상태" 칸에 동일 라벨 포함 (자동 반영)

### 제외

- "비고" 칸 (현재 근무시간 달성도 표시) — 변경 없음
- `EmployeeCard`의 "지각 N" 카운트 — 변경 없음 (지각 횟수 표시용이므로)
- `AttendanceTable.tsx`, `AdminAttendanceTable.tsx` — "지각" 상태를 사용하지 않아 해당 없음

## 설계

### 변경 파일

`src/components/dashboard/attendance/tabs/records/RecordsDetailTable.tsx` **한 개만** 수정.

### 1. 포맷 헬퍼 (파일 내 로컬 함수)

```ts
function formatLateDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `+${h}h ${m}m`;
  if (h) return `+${h}h`;
  return `+${m}m`;
}
```

- 재사용처가 없으므로 별도 유틸로 분리하지 않음 (YAGNI)
- `minutes`는 항상 양의 정수 (지각 판정 시 `checkInMin > workStartMinutes`로 이미 필터됨)

### 2. `getRecordStatus()` 수정

현재 지각 판정 로직은 이미 `checkInMin`, `workStartMinutes`를 계산한다. `diff = checkInMin - workStartMinutes`를 라벨에 붙이면 된다.

```ts
if (checkInMin > workStartMinutes) {
  const diff = checkInMin - workStartMinutes;
  return {
    label: `지각 ${formatLateDuration(diff)}`,
    color: "bg-red-50 text-red-600"
  };
}
```

### 3. 배지 스타일

현재:
```tsx
<span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status.color}`}>
  {status.label}
</span>
```

변경:
```tsx
<span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${status.color}`}>
  {status.label}
</span>
```

`whitespace-nowrap` 추가 — 라벨이 `지각 +1h 5m`처럼 길어져도 줄바꿈 방지.

### 4. 엑셀 다운로드

`handleExcelDownload`는 이미 `status.label`을 그대로 셀에 넣으므로 **코드 수정 불필요**. 자동으로 `지각 +15m` 같은 라벨이 엑셀에 포함된다.

## 동작 예시

| 출근 | 근무시작 | 지각 분 | 상태 배지 표시 |
|---|---|---|---|
| 09:00 | 09:00 | 0 | `정상` |
| 09:01 | 09:00 | 1 | `지각 +1m` |
| 09:15 | 09:00 | 15 | `지각 +15m` |
| 09:59 | 09:00 | 59 | `지각 +59m` |
| 10:00 | 09:00 | 60 | `지각 +1h` |
| 10:05 | 09:00 | 65 | `지각 +1h 5m` |
| 11:00 | 09:00 | 120 | `지각 +2h` |

## 경계 조건 / 주의점

- **초 단위 반올림 없음**: `kst.getUTCMinutes()`는 초를 버리므로 `09:00:30` 출근은 기존처럼 지각 아님 (행동 변화 없음).
- **타임존**: 기존 KST 변환 로직(`kst = date + 9h`) 그대로 사용.
- **근무시간표 이력**: `getScheduleForDate(workSchedules, workDate)`가 이미 날짜별 근무시작 시간을 반환하므로 이력 모델과 호환.

## 성공 기준

1. 지각한 날짜는 상태 배지에 `지각 +Xm` 또는 `지각 +Xh Ym` 형태로 지각 시간이 함께 표시된다.
2. 정상 / 미출근 / 반차 / 휴가 등 다른 상태의 표시는 변경되지 않는다.
3. 엑셀 다운로드 시 "상태" 칸에도 동일 라벨이 나온다.
4. 배지가 길어져도 줄바꿈 없이 한 줄로 표시된다.

## 테스트 시나리오

- 출근 시간 = 근무 시작 시간 → `정상` 배지
- 출근 시간 < 근무 시작 시간 → `정상` 배지
- 1분 지각 → `지각 +1m`
- 60분 지각 (정확히 1시간) → `지각 +1h` (공백이나 `0m` 없음)
- 75분 지각 → `지각 +1h 15m`
- 출근 기록 없음 (휴가 등) → 기존 라벨 그대로

## 구현 예상 규모

- 파일 1개, ~10줄 내외 수정
- 신규 의존성 없음
- 마이그레이션 없음
