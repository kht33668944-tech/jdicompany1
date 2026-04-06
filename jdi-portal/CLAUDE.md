# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JDICOMPANY 사내 포털 (jdi-portal) — 근태관리, 할일, 스케줄, 오류접수, 설정.
한국어 UI (`lang="ko"`), Asia/Seoul 시간대. Vercel 배포.

## Tech Stack

Next.js 16.2.2 (App Router) | TypeScript 5 (strict) | React 19 | Tailwind CSS 4 | Supabase (auth + DB + RLS) | @hello-pangea/dnd | sonner | phosphor-react 1.4.1 | ESLint 9

## Commands

```bash
npm run dev      # 개발 서버 (Turbopack)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
```

## Architecture

### Routes

`/` 랜딩 | `/(auth)/login,signup,forgot-password,reset-password` 인증 | `/auth/callback,signout` OAuth 콜백
`/dashboard` 홈 | `/dashboard/attendance` 근태 | `/dashboard/tasks` 할일 (`[id]` 상세) | `/dashboard/schedule` 스케줄 | `/dashboard/chat` 채팅 (`[channelId]` 대화방) | `/dashboard/reports` 오류접수 | `/dashboard/settings` 설정

### Middleware (Next.js 16)

`src/proxy.ts`에서 `updateSession()` 호출 (Next.js 16은 `middleware.ts` 대신 `proxy.ts` 사용).

### Data Layer

도메인별 `src/lib/{domain}/` 구조 (attendance, tasks, schedule, reports, chat, settings, notifications):

| 파일 | 역할 | Supabase 클라이언트 |
|------|------|-------------------|
| `queries.ts` | SELECT (서버 컴포넌트용) | `SupabaseClient`를 매개변수로 받음 |
| `actions.ts` | INSERT/UPDATE/DELETE (클라이언트용) | 내부에서 `createClient()` 직접 생성 |
| `types.ts` / `constants.ts` / `utils.ts` | 타입, 상수, 유틸 | — |

**`actions.ts`는 "use server" 서버 액션이 아님** — 브라우저에서 Supabase 직접 요청, RLS가 보안 담당.

크로스 도메인 집계: `src/lib/dashboard/queries.ts`

### Server/Client Split

- **서버** (`src/app/dashboard/*/page.tsx`): `getAuthUser()` → `queries.ts` → props 전달
- **클라이언트** (`src/components/dashboard/`): 상태 관리, `actions.ts` 호출, `router.refresh()`로 갱신

### Auth

`src/lib/supabase/auth.ts`의 `getAuthUser()` — React `cache()`로 중복 방지, `AuthUser { user, profile, supabase }` 반환.
Dashboard layout에서 `is_approved` 체크 (미승인 → `/login?error=not_approved`).

Supabase 클라이언트: 서버 `@/lib/supabase/server` (async, cookies) | 클라이언트 `@/lib/supabase/client` | 미들웨어 `@/lib/supabase/middleware`

### Notifications

`src/lib/notifications/` — Supabase RPC (`insert_notification`, `insert_notifications_batch`). Fire-and-forget 패턴.
발송 전 수신자별 `notification_settings`를 확인하여 비활성화된 알림 종류는 건너뜀.

### Security Model

- 모든 테이블 RLS에 `public.is_approved_user()` 체크 — 미승인 사용자는 DB 레벨에서 완전 차단
- 출퇴근 기록은 SECURITY DEFINER RPC (`attendance_check_in`, `attendance_check_out`)로만 변경 가능
- 알림 생성 RPC는 관리자 전용 (`admin_only` 체크)
- 프로필 UPDATE: 본인은 제한된 필드만, 관리자는 모든 사용자 수정 가능 (role/is_approved 변경은 전용 RPC)
- 파일 업로드: `src/lib/utils/upload.ts`의 `validateFile()`로 형식/크기 검증 (10MB, 허용 확장자)

### DB Migrations

`supabase/migrations/` (001~034). 적용: `npx supabase db push --linked`
모든 테이블에 RLS 적용 (`auth.uid()` + `is_approved_user()` 기반). 일부 SECURITY DEFINER RPC 사용.

## Design System

Brand color `brand-50`~`900` (blue, `--color-brand-600: #2563eb`) | Glass morphism (`.glass-card`, `.glass-sidebar`, `.glass-header`) | `rounded-2xl`~`3xl` | `shadow-sm` 기본

## Conventions

- Path alias: `@/*` → `./src/*`
- 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- 날짜 유틸: `src/lib/utils/date.ts` (KST 기준)
- 에러 유틸: `src/lib/utils/errors.ts` (`getErrorMessage`)
- 업로드 검증: `src/lib/utils/upload.ts` (`validateFile`)
- 프로필 타입: `src/lib/attendance/types.ts`의 `Profile` 공용 (work_start_time, work_end_time 포함)
- 역할: `"employee"` | `"admin"` (`verifyAdmin` 패턴)
- 공유 UI: `src/components/shared/` | 훅: `src/lib/hooks/`

## Important Notes

- Next.js 16 API가 기존과 다를 수 있음 — 코드 작성 전 `node_modules/next/dist/docs/` 확인
- `phosphor-react`는 `@phosphor-icons/react`로 마이그레이션 예정
- RLS 정책 추가/수정 시 반드시 `public.is_approved_user()` 체크 포함
- 새 테이블 생성 시 SELECT/INSERT/UPDATE/DELETE 모든 작업에 RLS 정책 필요
- 모달/드로어 구현 시 `ModalContainer` 사용 (포커스 트랩, ESC 닫기 내장)
- 모바일 터치 타겟은 최소 44px 유지 (버튼 패딩 `py-2.5` 이상)
