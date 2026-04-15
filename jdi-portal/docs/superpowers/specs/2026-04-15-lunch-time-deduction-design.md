# 점심시간 자동 공제 설계

- 작성일: 2026-04-15
- 도메인: 근태(attendance)

## 배경

근무시간 계산에 점심시간 1시간이 포함되어 실근무 시간이 과대 집계됨.
근무시간에서 점심 1시간을 자동 공제해 실근무 시간만 기록·표시한다.

## 정책

- **고정**: 점심시간은 1시간(60분)으로 모두 동일. DB에 별도 컬럼 없음.
- **조건부 공제**: `check_out - check_in > 4시간(240분)`일 때만 -60분.
  - 반차·조기퇴근 등 단시간 근무에서 음수/왜곡 방지.
- **소급 적용**: 기존 모든 `attendance_records`도 재계산(동일 정책).
- **UI**: 별도 안내 문구 없음. 표시되는 근무시간이 공제 후 값으로 바뀌기만 함.

## 아키텍처

### 단일 진실 소스: `attendance_records.total_minutes` (GENERATED 컬럼)

공제 로직은 **DB의 GENERATED 표현식**에서만 수행. 클라이언트 통계/차트는
이 컬럼값을 그대로 소비하므로 코드 변경이 필요 없다.

```sql
total_minutes =
  CASE WHEN check_in IS NOT NULL AND check_out IS NOT NULL THEN
    CASE
      WHEN EXTRACT(EPOCH FROM (check_out - check_in))/60 > 240
      THEN (EXTRACT(EPOCH FROM (check_out - check_in))::INT / 60) - 60
      ELSE  EXTRACT(EPOCH FROM (check_out - check_in))::INT / 60
    END
  ELSE NULL END
```

## 변경 범위

### 1. 신규 마이그레이션 `065_lunch_deduction.sql`

- `attendance_records.total_minutes` 컬럼 DROP 후 새 표현식으로 재생성.
- GENERATED 컬럼이라 기존 모든 행이 자동 재계산됨(소급 적용 달성).
- 단일 트랜잭션에서 수행.

### 2. 클라이언트/서버 코드

- **변경 없음.** `total_minutes`를 사용하는 아래 지점들은 공제된 값을 자동으로 받음.
  - `src/lib/attendance/stats.ts` (`calcAttendanceStats`, `calcWeeklyWorkHours`)
  - `src/components/dashboard/attendance/WeekSummaryCard.tsx`
  - `src/components/dashboard/attendance/tabs/records/AttendanceCharts.tsx`
  - `src/components/dashboard/attendance/tabs/records/RecordsSummaryCards.tsx`
  - `src/components/dashboard/attendance/AttendanceTable.tsx`
  - `src/components/dashboard/widgets/QuickStatsWidget.tsx`
  - `src/lib/dashboard/queries.ts`

### 3. 영향 없음(확인됨)

- 지각/조퇴 판정은 `check_in`/`check_out` 시각 자체로 수행 → 영향 없음.
- 근무시간표(`work_schedules`)의 start/end는 그대로 → 스케줄 UI 변화 없음.

## 검증

1. 기존 레코드에서 `total_minutes` 값이 의도한 정책대로 바뀌었는지 샘플 확인:
   - 9시간 근무(540분) → 480분
   - 4시간 근무(240분) → 240분(공제 없음)
   - 4시간 1분 근무(241분) → 181분
2. `npm run lint` / `npm run build` 통과.
3. 근태 화면에서 주간/월간 카드·차트가 오류 없이 렌더되는지 수동 확인.

## 리스크 / 주의

- GENERATED 컬럼 DROP/ADD 시 테이블 락 — 데이터량 소규모라 실무상 즉시.
- 경계값 240분(4시간)은 **비포함**(`> 240`). 정확히 4시간이면 공제 없음.
- Edge Function/RPC 변경 없음(이 테이블 insert는 체크인/체크아웃 RPC지만 `total_minutes`는 GENERATED라 기록 측 수정 불필요).

## 롤백

- 마이그레이션 내리기: 컬럼을 다시 기존 식(`check_out - check_in`)으로 재정의하는 역마이그레이션 작성.
