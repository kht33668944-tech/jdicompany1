# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JDICOMPANY 내부 시스템 포털 (jdi-portal) — 근태관리, 할일, 스케줄, 설정 기능을 갖춘 사내 포털.
한국어 UI (`lang="ko"`), 한국 시간대(Asia/Seoul) 기준.

## Tech Stack

- **Framework**: Next.js 16.2.2 (App Router, Server Components)
- **Language**: TypeScript 5 (strict mode)
- **React**: 19.2.4
- **Styling**: Tailwind CSS 4 (PostCSS, `@theme inline` for custom tokens)
- **Auth/DB**: Supabase (@supabase/ssr + @supabase/supabase-js)
- **Icons**: phosphor-react 1.4.1
- **Fonts**: Pretendard (Korean), Inter (Latin)
- **Lint**: ESLint 9 (eslint-config-next core-web-vitals + typescript)

## Commands

```bash
npm run dev      # 개발 서버 (Turbopack)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
```

## Architecture

### Data Layer Pattern

각 도메인은 `src/lib/{domain}/` 아래 동일한 구조:

```
src/lib/{domain}/
  types.ts      # 타입 정의
  constants.ts  # 상수, 설정 매핑
  queries.ts    # Supabase SELECT 쿼리 (서버 컴포넌트에서 호출)
  actions.ts    # "use server" 서버 액션 (INSERT/UPDATE/DELETE + revalidatePath)
  utils.ts      # 순수 유틸리티 함수 (선택적)
```

도메인: `attendance`, `tasks`, `schedule`, `settings`

### Server/Client Component Split

- **서버 컴포넌트** (`src/app/dashboard/*/page.tsx`): 데이터 fetch → props로 전달
- **클라이언트 컴포넌트** (`src/components/dashboard/`): 인터랙션, 상태 관리
- 서버 액션 호출 후 `revalidatePath()`로 갱신, 클라이언트에서 `router.refresh()`

### Supabase Client

- 서버: `createClient()` from `@/lib/supabase/server` (cookies 기반)
- 클라이언트: `createClient()` from `@/lib/supabase/client` (브라우저)
- 미들웨어: `@/lib/supabase/middleware` (세션 갱신)

### Dashboard Shell

`DashboardShell` → `Sidebar` + `Header` + children. 사이드바 접힘/펼침 상태 관리.
인증은 `src/app/dashboard/layout.tsx`에서 처리 (미인증 시 `/login` redirect).

### DB Migrations

`supabase/migrations/` 에 번호순 SQL 파일 (001~016).
적용: `npx supabase db push --linked`
RLS 정책이 모든 테이블에 적용됨 — 쿼리 작성 시 `auth.uid()` 기반 접근 제어 고려.

## Design System

- **Brand color**: `brand-50` ~ `brand-900` (blue 계열, `--color-brand-600: #2563eb`)
- **Glass morphism**: `.glass-card`, `.glass-sidebar`, `.glass-header` 클래스 (globals.css)
- **Rounded corners**: `rounded-2xl` ~ `rounded-3xl` 기본
- **Shadow**: `shadow-sm` 기본, 강조 시 `shadow-lg shadow-brand-500/20`

## Conventions

- Path alias: `@/*` → `./src/*`
- 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Route group `(auth)`로 인증 관련 페이지 묶음
- 날짜 유틸: `src/lib/utils/date.ts` (`toDateString`, `formatDate`, `addDays` 등 — KST 기준)
- 프로필 타입은 `src/lib/attendance/types.ts`의 `Profile` 공용 사용

## Work Strategy — 플러그인 활용 가이드

### 큰 작업 (새 기능, 리디자인, 다수 파일 변경)
- **OMC ultrawork** (`/oh-my-claudecode:ultrawork`) 로 독립적인 파일을 **병렬 에이전트**로 동시 작업
- 각 에이전트에 model 명시: 단순 변경=`haiku`, 표준 구현=`sonnet`, 복잡 분석=`opus`
- `run_in_background: true`로 빌드/테스트 등 긴 작업 백그라운드 실행
- 완료 후 `/simplify`로 코드 리뷰 (reuse/quality/efficiency 3개 에이전트 병렬)

### 기획/설계 단계
- **brainstorming** (`/superpowers:brainstorming`) — 새 기능 기획, 접근법 비교, 디자인 결정
- **writing-plans** (`/superpowers:writing-plans`) — 구체적 구현 계획 작성
- **Plan mode** — 큰 작업 전 항상 플랜 모드로 계획 확정 후 실행

### 디버깅/리뷰
- **systematic-debugging** (`/superpowers:systematic-debugging`) — 버그 발생 시
- **requesting-code-review** (`/superpowers:requesting-code-review`) — 구현 완료 후 검증
- **verification-before-completion** (`/superpowers:verification-before-completion`) — 커밋 전 최종 확인

### 원칙
- 2개 이상 독립 작업은 **항상 병렬** 실행 (단일 메시지에 여러 Agent 호출)
- 작은 작업 (단일 파일 수정, 간단한 질문)은 직접 처리 — 에이전트 오버헤드 불필요
- UI 목업 → 구현 시: 사용자가 HTML 목업 제공하면 그 디자인을 **정확히** 반영

## Important Notes

- Next.js 16은 최신 버전으로, 기존 버전과 API가 다를 수 있음. 코드 작성 전 `node_modules/next/dist/docs/`의 가이드를 확인할 것.
- `.env.local` 파일은 커밋하지 않음
- `.next` 캐시가 비대해지면 dev 서버 성능 저하 — `rm -rf .next` 후 재시작 (서버 꺼진 상태에서)
- `phosphor-react`는 tree-shaking 안 되는 구버전 — `@phosphor-icons/react`로 마이그레이션 예정
