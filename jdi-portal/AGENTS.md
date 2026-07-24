# JDICOMPANY Portal Agent Guide

JDICOMPANY 내부 포털입니다. 비개발자 운영자가 쓰는 업무 도구이므로 안정성, 명확한 한국어 UI, 데이터 보호를 우선합니다.

## 현재 스택

- Next.js 16.2.11 App Router, React 19.2.4, TypeScript strict
- Tailwind CSS 4, ESLint 9
- Supabase Auth, Postgres, RLS, Storage, Realtime, Edge Functions
- 주요 라이브러리: `@supabase/ssr`, `@supabase/supabase-js`, `@hello-pangea/dnd`, `phosphor-react`, `recharts`, `sonner`, `xlsx`, `idb`, `pg`
- 배포: Railway 루트 래퍼에서 `jdi-portal` 빌드

## 앱 기능 영역

- 인증: 로그인, 회원가입, 비밀번호 재설정, 승인된 사용자만 대시보드 접근
- 대시보드: 오늘 일정, 내 업무, 근태, 최근 활동, 알림, 업무지시 카드, 이름 클릭 팝업
- 근태: 출퇴근, IP 검증, 근무시간 변경, 휴가, 관리자 승인, 기록/통계
- 업무: 목록/타임라인/캘린더, 상세 패널, 체크리스트, 댓글, 첨부, 활동 기록, 프로젝트 배지
- 채팅: 채널, DM, Realtime, 멘션, 읽음, 즐겨찾기, 고정, 알림, IndexedDB 캐시
- 일정: 월/주/일/목록 뷰, 참여자, 공개 범위, 휴가 연동
- 리포트: 생성, 상세, 빠른 패널
- 인플루언서: 캠페인, 시딩 일정, 등급/지표, 미디어, 자동 분석 Edge Function
- 업무 타임라인: 업무 기록 타임라인, 파일 첨부, 프로젝트별 필터
- 지출관리: 고정/변동 지출, 분류·색상, 결제수단, 영수증, 변동성 금액 확정, 캘린더, 엑셀 다운로드
- 프로젝트: 프로젝트 분류(색상·보관), 타임라인·업무 연동, 접두어 자동 분류
- 업무지시: 포털 내 업무 지시·수락/거절, 미확인 배지, 재촉 알림
- 설정: 프로필, 계정, 알림, 앱 설치, 관리자 섹션

## 경로 규칙

| 목적 | 경로 |
|---|---|
| App Router 페이지 | `src/app/**/page.tsx` |
| 도메인 UI | `src/components/dashboard/<domain>/` |
| 공용 UI | `src/components/shared/` |
| 도메인 로직 | `src/lib/<domain>/` |
| Supabase 클라이언트 | `src/lib/supabase/` |
| 공용 유틸 | `src/lib/utils/`, `src/lib/hooks/` |
| DB 마이그레이션 | `supabase/migrations/NNN_*.sql` |
| Edge Function | `supabase/functions/<name>/index.ts` |
| 설계/계획 문서 | `docs/superpowers/specs/`, `docs/superpowers/plans/` |

`@/*`는 `./src/*`를 가리킵니다.

## 개발 명령

```bash
npm run dev
npm run build
npm run lint
```

Supabase 작업:

```bash
npx supabase db push --linked
npx supabase functions deploy <name> --no-verify-jwt
```

## Next.js 주의

이 프로젝트는 Next.js 16입니다. Next.js API, 라우팅, 캐시, 설정을 수정할 때는 현재 설치된 문서를 먼저 확인합니다.

- `node_modules/next/dist/docs/`에 있는 관련 문서를 우선 확인합니다.
- Next 16에서는 `middleware.ts` 대신 `src/proxy.ts`에서 세션 갱신을 처리합니다.
- 서버 컴포넌트와 클라이언트 컴포넌트를 명확히 분리합니다. 필요한 곳에만 `"use client"`를 둡니다.
- `metadata` export는 클라이언트 컴포넌트에 두지 않습니다.

## Supabase 불변 조건

- 모든 사용자 데이터 테이블은 RLS를 활성화하고 `public.is_approved_user()` 기준을 반영합니다.
- 관리자 전용 RPC는 `admin_only` 또는 동등한 검증을 포함합니다.
- `SECURITY DEFINER` 함수 안에서는 반드시 `auth.uid()`와 권한을 검증합니다.
- 날짜 기준은 Asia/Seoul입니다. SQL에서 `CURRENT_DATE`, `NOW()`를 그대로 쓰지 말고 KST 변환을 명시합니다.
- Edge Function은 Deno 런타임입니다. Node 전용 npm 패키지를 그대로 가져오지 않습니다.

## 환경 변수

커밋 가능한 예시는 `.env.local.example`에만 둡니다. 실제 값은 `.env.local`, Railway Variables, Supabase Secrets에서 관리합니다.

현재 공개 환경 변수:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

서버 전용 값은 `DATABASE_URL`, Edge Function secrets 등으로 관리하며 클라이언트 코드에 노출하지 않습니다.

## 코드 작성 기준

- 비개발자 사용자를 전제로, 화면 문구는 쉬운 한국어로 씁니다.
- 기능 수정은 해당 도메인의 `queries.ts`, `actions.ts`, `types.ts`, 컴포넌트 구조를 먼저 확인합니다.
- 파일 업로드는 `src/lib/utils/upload.ts`의 검증 흐름을 따릅니다.
- 오류 메시지는 `src/lib/utils/errors.ts`의 패턴을 우선 사용합니다.
- 날짜 포맷과 KST 처리는 `src/lib/utils/date.ts`를 우선 사용합니다.
- `any`와 넓은 타입 단언은 피하고, 필요한 타입은 도메인 `types.ts`에 둡니다.

## 도메인별 추가 지침

- DB/RLS/Edge Function: `supabase/CLAUDE.md`
- 근태: `src/components/dashboard/attendance/CLAUDE.md`
- 채팅: `src/components/dashboard/chat/CLAUDE.md`
- 업무: `src/components/dashboard/tasks/CLAUDE.md`
- 전체 프로젝트 가이드: `docs/claude/project-guide.md`
- 작업 흐름: `docs/claude/workflow.md`

## 리뷰 기준

코드 리뷰 요청을 받으면 버그와 회귀 위험을 먼저 봅니다.

- 인증/권한/RLS 우회 가능성
- 서버/클라이언트 경계 오류
- KST/UTC 날짜 오류
- Supabase error 무시
- Realtime 구독 cleanup 누락
- 무한 렌더링, race condition, stale cache
- N+1 쿼리와 불필요한 전체 로드
- 민감 정보 노출

보고는 파일과 라인을 포함해 심각도 순으로 작성합니다.
