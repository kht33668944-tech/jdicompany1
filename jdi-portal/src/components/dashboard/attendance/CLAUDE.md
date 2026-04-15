# Attendance 도메인 규칙

## KST 타임존

- 날짜 비교는 **반드시 `toDateString()`** 사용 (`src/lib/utils/date.ts`)
- JS `new Date().toISOString().slice(0,10)` 직접 쓰면 자정 전후 KST/UTC 차이로 하루 어긋남
- 통계 계산(`stats.ts`)은 클라이언트에서 수동 KST 오프셋(`+9h`) 적용 — `extractTimeMinutes()` 참고
- 차트용 Date 생성 시 반드시 `+09:00` 오프셋 포함: `new Date(\`${date}T12:00:00+09:00\`)`

## 출퇴근 보안 (IP 2단계 검증)

- 클라이언트 `/api/ip` 프리체크는 UX용 (빠른 피드백)
- **실제 검증은 서버 RPC** — `x-forwarded-for` 헤더에서 첫 번째 IP 추출
- 두 단계 모두 통과해야 출퇴근 처리됨

## 근무시간표 이력 모델

- `effective_from` + `is_initial_seed` 플래그로 버전 관리
- 직접 UPDATE 금지 — 반드시 RPC(`set_initial_work_schedule`, `approve_work_schedule_change_request`) 통해 변경
- `getScheduleForDate()`로 특정 날짜에 적용되는 근무시간 조회

## 휴가 잔여일

- `ensure_vacation_balance` RPC가 첫 조회 시 `hire_date` 기반으로 자동 생성
- 별도 초기화 로직 불필요 — RPC에 위임

## 승인/반려 워크플로우

- 승인·반려 후 `createNotification()` 호출 필수 — 누락 시 사용자가 결과를 모름
- 요청 상태: `"대기중"` → `"승인"` / `"반려"`, 승인 후 `"취소요청"` → `"취소"` 가능
- Admin 액션은 `requireAdmin()` 체크 필수

## 점심시간 공제

- `attendance_records.total_minutes` GENERATED 컬럼에서 자동 처리
- 정책: `check_out - check_in > 240분`일 때만 -60분
- 클라이언트는 이 컬럼값을 그대로 소비 (별도 공제 로직 없음)
- 정책 변경 시 migration 065 식만 수정

## 데이터 페칭

- `page.tsx`에서 admin/일반 분기하여 `Promise.all()` 병렬 fetch
- 클라이언트 뮤테이션 후 `router.refresh()`로 서버 데이터 갱신
- 실시간 구독 없음 — 새로고침 기반
