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
- 실제 검증은 서버/RPC에서 다시 수행해야 합니다(마이그 062).
- IP 추출은 `src/lib/utils/ip.ts`의 `extractClientIp()` 하나만 씁니다. `cf-connecting-ip` → `x-forwarded-for` → `x-real-ip` 순서로 보고 루프백은 건너뜁니다.

> **의도된 설계 — 취약점으로 지적하지 않습니다.** 2026-09-04 운영자 승인으로 **Cloudflare 의 `cf-connecting-ip` 를 최우선**으로 바꿨습니다(전자서명 증거의 조작 방지 — 접속자가 못 덮어쓰는 헤더). 운영(jdiportal.com)은 항상 Cloudflare 를 지나므로 이 헤더가 있고, 없는 환경(로컬 등)에서는 기존처럼 `x-forwarded-for` 첫 값 → `x-real-ip` 로 내려갑니다. 사무실 IP를 벗어난 원격 출근을 막는 **운영 편의 장치이지 인증 수단이 아니며**, 실제 권한은 로그인과 RLS가 담당합니다. 리뷰에서 "헤더 위조 가능"으로 반복 보고하지 말고, 정말 바꿔야 한다면 먼저 운영자에게 확인합니다.

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
