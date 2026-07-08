# 근태 도메인 지침

근태는 날짜, 권한, 승인 흐름이 모두 중요합니다. 작은 UI 수정도 KST와 관리자 권한을 함께 확인합니다.

## 주요 파일

- UI: `src/components/dashboard/attendance/`
- 페이지: `src/app/dashboard/attendance/page.tsx`
- API: `src/app/api/attendance/`
- 로직: `src/lib/attendance/`
- 유틸: `src/lib/utils/date.ts`, `src/lib/utils/vacation.ts`, `src/lib/utils/ip.ts`

## KST 기준

- 날짜 문자열은 `toDateString()` 계열 유틸을 우선 사용합니다.
- `new Date().toISOString().slice(0, 10)` 방식은 UTC 날짜라 근태에서 위험합니다.
- SQL 날짜 계산은 Asia/Seoul 변환을 명시합니다.
- 차트용 Date 생성은 `+09:00` 오프셋을 포함합니다.

## 출퇴근과 IP 검증

- 클라이언트의 `/api/ip` 확인은 사용자 피드백용입니다.
- 실제 검증은 서버/RPC에서 다시 수행해야 합니다.
- `x-forwarded-for` 등 프록시 헤더 처리는 서버 쪽 기준을 확인합니다.

## 근무시간 변경

- 직접 UPDATE보다 RPC 흐름을 우선합니다.
- `effective_from`과 변경 이력을 보존합니다.
- 특정 날짜에 적용되는 근무시간은 이력 기준으로 조회합니다.

## 휴가

- 휴가 잔여일은 `hire_date` 기준 자동 생성/계산 흐름을 존중합니다.
- 휴가 승인/취소는 일정 연동 여부를 함께 확인합니다.
- 휴가 일수 계산은 주말, 반차, KST 경계를 확인합니다.

## 승인 흐름

- 관리자 액션은 `requireAdmin()` 또는 동등한 검증을 거칩니다.
- 승인/반려 후 알림 생성이 누락되지 않았는지 확인합니다.
- 사용자가 결과를 볼 수 있도록 상태 갱신과 `router.refresh()` 흐름을 확인합니다.

## 점심시간 공제

- `attendance_records.total_minutes`의 DB 생성/계산 규칙을 우선합니다.
- 클라이언트에서 별도 공제 로직을 중복 구현하지 않습니다.
