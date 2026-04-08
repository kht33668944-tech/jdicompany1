# 근무시간: 승인형 + 기간 이력 구조

작성일: 2026-04-08
대상: JDI 포털 근태관리 모듈

## 배경 / 문제

현재 근무시간(`profiles.work_start_time` / `work_end_time`)은 사용자당 1쌍만 저장되며 변경 시 즉시 덮어쓰여진다. 결과:

- 출근 시간을 바꾸면 과거 기록의 지각 판정까지 함께 바뀐다.
- 직원이 근무시간을 임의로 변경할 수 있다 (관리자 통제 부재).
- 시기별로 다른 근무시간을 적용할 수 없다.

## 목표

1. **승인형 변경**: 첫 설정만 즉시 저장, 이후 변경은 대표 승인 필요. 관리자는 항상 즉시 저장 가능.
2. **기간별 이력**: 근무시간 변경 시 덮어쓰지 않고 "적용 시작일" 기준으로 새 이력 행을 추가. 과거 기록은 그 시기의 기준으로 계산.

## 비목표 (YAGNI)

- 과거 소급 변경 (`effective_from`을 과거로 지정) — 추후 필요 시 별도 기능.
- 적용 시작일을 관리자가 승인 시점에 조정하는 기능 — B안 채택, C안은 제외.
- `effective_to` 명시적 종료일 컬럼 — 다음 행의 `effective_from`으로 자동 결정.

## 데이터 모델

### 새 테이블: `work_schedules`

근무시간 이력. 한 직원의 특정 시점부터 적용되는 근무시간 1쌍.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | gen_random_uuid() |
| `user_id` | uuid | `profiles.id` FK, on delete cascade |
| `work_start_time` | time | NOT NULL |
| `work_end_time` | time | NOT NULL |
| `effective_from` | date | NOT NULL, 이 날짜부터 적용 (KST) |
| `is_initial_seed` | boolean | DEFAULT false. 마이그레이션 자동 생성 표식 |
| `created_by` | uuid | profiles.id, NULL 허용 (시스템 생성 시) |
| `created_at` | timestamptz | DEFAULT now() |

**제약**: `UNIQUE(user_id, effective_from)`

**인덱스**: `(user_id, effective_from DESC)`

**RLS**:
- SELECT: 본인 행 OR `is_approved_user()` 통과한 관리자
- INSERT/UPDATE/DELETE: 관리자만 직접 가능 (일반 직원은 RPC 경유)

### 새 테이블: `work_schedule_change_requests`

직원이 제출하는 근무시간 변경 요청.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | profiles.id FK |
| `requested_start_time` | time | NOT NULL |
| `requested_end_time` | time | NOT NULL |
| `effective_from` | date | NOT NULL, 제출 시점 기준 오늘 이후 |
| `reason` | text | NULL 허용 |
| `status` | text | `대기중` / `승인` / `반려`, DEFAULT `대기중` |
| `reviewed_by` | uuid | NULL 허용 |
| `reviewed_at` | timestamptz | NULL 허용 |
| `reject_reason` | text | NULL 허용 |
| `created_at` | timestamptz | DEFAULT now() |

**RLS**:
- SELECT: 본인 OR 관리자
- INSERT: 본인 (단, RPC가 "이력에 non-seed 행이 1개 이상 존재"를 검증)
- UPDATE: 관리자만 (status 전환)

### `profiles.work_start_time` / `work_end_time`

신규 코드에서는 사용 중지 (deprecated). 마이그레이션 후 컬럼 자체는 당장 삭제하지 않고 남겨두되, 모든 읽기 경로를 `work_schedules` 조회로 교체. (드롭은 후속 PR.)

## RPC 함수 (SECURITY DEFINER)

### `set_initial_work_schedule(p_start time, p_end time)`
- 호출자 본인의 첫 근무시간 설정. **non-seed 이력이 0개일 때만** 허용.
- 새 행 1개 INSERT, `effective_from = today_kst()`, `created_by = auth.uid()`, `is_initial_seed = false`.
- 이미 non-seed 행이 있으면 에러: "이미 설정되어 있습니다. 변경 요청을 제출해주세요."

### `submit_work_schedule_change_request(p_start time, p_end time, p_effective_from date, p_reason text)`
- non-seed 이력이 1개 이상일 때만 허용.
- `p_effective_from >= today_kst()` 검증.
- `work_schedule_change_requests`에 INSERT.
- 관리자 전원에게 알림 발송 (`createNotification` 호출은 클라이언트 액션 측에서, RPC는 INSERT만).

### `approve_work_schedule_change_request(p_request_id uuid)`
- 관리자 검증.
- 요청 status를 `대기중` → `승인`으로 변경.
- `work_schedules`에 새 행 INSERT (요청 값 + `created_by = auth.uid()`).
- 동일 `(user_id, effective_from)` 충돌 시 기존 행을 대체 (DELETE → INSERT 또는 UPSERT).
- 신청자에게 알림.

### `reject_work_schedule_change_request(p_request_id uuid, p_reason text)`
- 관리자 검증.
- status `대기중` → `반려`, `reject_reason` 저장.
- 신청자에게 알림.

### `admin_set_work_schedule(p_user_id uuid, p_start time, p_end time, p_effective_from date)`
- 관리자 검증.
- 본인/타인 무관 즉시 저장. `effective_from`은 과거도 허용 (관리자 권한).
- `work_schedules`에 새 행 INSERT (충돌 시 대체).

### `get_work_schedule_for_date(p_user_id uuid, p_date date) returns table(work_start_time time, work_end_time time)`
- 단일 날짜 기준 적용 중인 시간 조회. 클라이언트에서 매 record마다 호출하면 비효율 → 실제로는 **기간 단위 조회 후 코드에서 매칭**.

### 기간 단위 조회: 별도 RPC 없이 일반 SELECT
```sql
SELECT * FROM work_schedules
WHERE user_id = $1 AND effective_from <= $end_date
ORDER BY effective_from ASC;
```
이력 행 수가 적으므로 (직원당 보통 5개 미만) 클라이언트에서 매칭.

## 마이그레이션

1. `work_schedules` / `work_schedule_change_requests` 테이블 생성 + RLS + RPC.
2. **시드 데이터 삽입**:
   ```sql
   INSERT INTO work_schedules (user_id, work_start_time, work_end_time, effective_from, is_initial_seed)
   SELECT id,
          COALESCE(work_start_time, '09:00:00'),
          COALESCE(work_end_time, '18:00:00'),
          '2000-01-01'::date,
          true
   FROM profiles;
   ```
3. 결과: 모든 기존 직원은 `is_initial_seed=true` 1줄만 보유 → 첫 진짜 변경은 "즉시 저장 모드"로 동작 (1회 자유 수정 기회).
4. `profiles.work_start_time` / `work_end_time`은 그대로 유지 (이번 PR에서는 드롭하지 않음).

## 코드 변경

### `src/lib/attendance/types.ts`
```ts
export interface WorkSchedule {
  id: string;
  user_id: string;
  work_start_time: string;
  work_end_time: string;
  effective_from: string;
  is_initial_seed: boolean;
  created_by: string | null;
  created_at: string;
}

export interface WorkScheduleChangeRequest {
  id: string;
  user_id: string;
  requested_start_time: string;
  requested_end_time: string;
  effective_from: string;
  reason: string | null;
  status: "대기중" | "승인" | "반려";
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  profiles?: { full_name: string };
}
```

### `src/lib/attendance/queries.ts` — 추가 함수
- `getWorkSchedules(supabase, userId)` — 본인 이력 전체
- `getWorkSchedulesForRange(supabase, userId, endDate)` — 기간 계산용
- `getMyWorkScheduleChangeRequests(supabase, userId)`
- `getPendingWorkScheduleChangeRequests(supabase)` (관리자용)
- `getCurrentWorkSchedule(supabase, userId)` — 오늘 적용 중인 1행

### `src/lib/attendance/actions.ts` — 추가 함수
- `setInitialWorkSchedule(start, end)` — RPC 래퍼
- `submitWorkScheduleChangeRequest({ start, end, effectiveFrom, reason })` — RPC + 관리자 알림
- `approveWorkScheduleChangeRequest(requestId)` — RPC + 신청자 알림
- `rejectWorkScheduleChangeRequest(requestId, reason)` — RPC + 신청자 알림
- `adminSetWorkSchedule({ userId, start, end, effectiveFrom })` — 관리자 즉시 저장
- 기존 `updateWorkSchedule` 제거 (또는 내부적으로 위 함수들 호출하도록 분기)

### `src/lib/attendance/stats.ts` — 시그니처 변경
새 헬퍼:
```ts
export interface WorkScheduleEntry {
  effective_from: string;
  work_start_time: string;
  work_end_time: string;
}

export function getScheduleForDate(
  schedules: WorkScheduleEntry[],
  workDate: string
): { workStart: string; workEnd: string } {
  // schedules는 effective_from ASC 정렬
  // workDate >= effective_from 중 가장 최근 행 반환
  // 매칭 없으면 DEFAULT_WORK_START/END
}
```

`calcAttendanceStats` 시그니처:
```ts
export function calcAttendanceStats(
  records: AttendanceRecord[],
  schedules: WorkScheduleEntry[]
): AttendanceStats
```
내부에서 각 record의 work_date에 대해 `getScheduleForDate` 호출 후 해당 기준으로 지각/조퇴/평균 계산.

기존 `(records, workStart, workEnd)` 시그니처를 호출하는 모든 곳을 `(records, schedules)`로 교체.

### UI 컴포넌트

**`WorkScheduleCard.tsx`** (전면 개편)
- props: `userId`, `currentSchedule`, `hasNonSeedHistory`, `pendingRequest`, `isAdmin`
- 분기:
  - `!hasNonSeedHistory && !isAdmin` → "처음 설정" 모드: 출근/퇴근 입력 + "저장" → `setInitialWorkSchedule`
  - `hasNonSeedHistory && !isAdmin` → "변경 요청" 모드:
    - 현재 적용 시간 표시
    - 대기중 요청이 있으면 그 내용 표시 + "취소" 가능 (선택, MVP에선 표시만)
    - 없으면 "변경 요청" 버튼 → 모달: 새 시간 + 적용 시작일(오늘 이후) + 사유
  - `isAdmin` → "직접 저장" 모드: 출근/퇴근 + 적용 시작일(과거 허용) → `adminSetWorkSchedule`
- 이력 보기 (접기/펼치기) — 선택, MVP 포함

**`tabs/AdminTab.tsx`** — 새 섹션 "근무시간 변경 요청"
- 기존 `AdminVacationRequests` / `correction_requests` 패턴 모방
- 카드: 직원명 / 현재 시간 → 요청 시간 / 적용 시작일 / 사유 / 승인·반려 버튼

**기록 탭 (`tabs/RecordsTab.tsx`, `RecordsDetailTable.tsx`, `AttendanceCharts.tsx`, `RecordsSummaryCards.tsx`)**
- 데이터 fetch 시 해당 기간의 `work_schedules`도 함께 조회
- `calcAttendanceStats(records, schedules)` 호출
- 일별 표시 (`RecordsDetailTable`)에서 각 행의 지각 여부도 그날의 기준으로 표시

**`AttendanceCalendar.tsx` / `WeekSummaryCard.tsx`**
- 동일하게 기간 schedules 받아 그날 기준으로 색상/상태 결정

**`AttendancePageClient.tsx`**
- 페이지 로딩 시 `work_schedules` (현재 사용자 + 관리자면 전체) 추가 fetch
- 하위 컴포넌트에 prop 전달

**관리자 직원 상세 (`AdminAttendanceTable.tsx`, `AdminRecordsView.tsx`)**
- 직원별 schedules도 함께 fetch해서 동일하게 동적 계산

## 알림

기존 `createNotification` 패턴 사용:
- 변경 요청 제출 → 모든 관리자에게 `work_schedule_change_requested` (link: `/dashboard/attendance`)
- 승인 → 신청자에게 `work_schedule_approved`
- 반려 → 신청자에게 `work_schedule_rejected` (사유 포함)

## 엣지 케이스 / 결정 사항

- **동일 `effective_from` 충돌**: 관리자가 같은 날짜로 또 저장 → 기존 행 대체 (UPSERT).
- **요청 대기중인데 또 요청**: MVP는 "대기중인 요청이 1건 있으면 새 요청 차단" (UI에서 버튼 비활성화 + RPC에서도 검증).
- **요청 취소**: MVP에서는 직원이 본인 대기중 요청을 취소(`DELETE`)할 수 있도록 단순 액션 추가.
- **승인 시점에 `effective_from`이 이미 과거가 됨**: 그대로 진행 (요청 시점엔 미래였음). `effective_from`을 강제로 오늘로 조정하지 않음.
- **시드 행 + 새 행이 같은 미래 날짜**: 시드는 `2000-01-01`이라 충돌 불가.
- **기록이 시드 시작일(2000-01-01) 이전?**: 불가능 (입사일 이후만 기록 존재).

## 테스트 시나리오 (수동)

1. 신규 가입 직원 → "처음 설정" 카드 → 저장 → 즉시 반영, 카드가 "변경 요청" 모드로 전환
2. 같은 직원이 시간 변경 시도 → 모달에 적용 시작일 입력 (오늘 이전 선택 불가) → 제출 → 대기중 표시
3. 관리자 탭에 요청 카드 표시 → 승인 → 직원 카드의 "현재 적용 중" 갱신 (단, effective_from이 미래면 표시는 미래 날짜 안내)
4. 4월 1일~10일 출근 기록은 09:00 기준 / 11일부터 08:30 기준으로 변경 → 기록 탭의 지각/통계가 날짜별 다른 기준으로 계산되는지 확인
5. 관리자 본인 시간 변경 → 즉시 저장됨
6. 반려 → 직원에게 알림, 기존 시간 유지

## 미해결 / 후속 작업

- `profiles.work_start_time` / `work_end_time` 컬럼 드롭 (별도 PR)
- 변경 요청 이력의 페이지네이션 (요청이 많아지면)
- 적용 시작일을 관리자가 승인 시점에 조정하는 기능 (필요 시)
