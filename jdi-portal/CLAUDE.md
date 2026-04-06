# CLAUDE.md

## Project Overview

JDICOMPANY 사내 포털 (jdi-portal) — 근태관리, 할일, 스케줄, 설정.
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
`/dashboard` 홈 | `/dashboard/attendance` 근태 | `/dashboard/tasks` 할일 (`[id]` 상세) | `/dashboard/schedule` 스케줄 | `/dashboard/settings` 설정

### Middleware (Next.js 16)

`src/proxy.ts`에서 `updateSession()` 호출 (Next.js 16은 `middleware.ts` 대신 `proxy.ts` 사용).

### Data Layer

도메인별 `src/lib/{domain}/` 구조 (attendance, tasks, schedule, settings, notifications):

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

### DB Migrations

`supabase/migrations/` (001~024). 적용: `npx supabase db push --linked`
모든 테이블에 RLS 적용 (`auth.uid()` 기반). 일부 SECURITY DEFINER RPC 사용.

## Design System

Brand color `brand-50`~`900` (blue, `--color-brand-600: #2563eb`) | Glass morphism (`.glass-card`, `.glass-sidebar`, `.glass-header`) | `rounded-2xl`~`3xl` | `shadow-sm` 기본

## Conventions

- Path alias: `@/*` → `./src/*`
- 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- 날짜 유틸: `src/lib/utils/date.ts` (KST 기준)
- 에러 유틸: `src/lib/utils/errors.ts` (`getErrorMessage`)
- 프로필 타입: `src/lib/attendance/types.ts`의 `Profile` 공용
- 역할: `"employee"` | `"admin"` (`verifyAdmin` 패턴)
- 공유 UI: `src/components/shared/` | 훅: `src/lib/hooks/`

## Important Notes

- Next.js 16 API가 기존과 다를 수 있음 — 코드 작성 전 `node_modules/next/dist/docs/` 확인
- `phosphor-react`는 `@phosphor-icons/react`로 마이그레이션 예정
