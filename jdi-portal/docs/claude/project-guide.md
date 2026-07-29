# JDI 포털 프로젝트 가이드

필요한 부분만 빠르게 참고하기 위한 기술 가이드입니다. 오래된 배경이나 과거 이슈는 `docs/claude/archive/`에 남겨둡니다.

## 개요

JDICOMPANY 사내 업무 포털입니다. 승인된 사용자만 접근하며, 근태/업무/채팅/일정/리포트/인플루언서/업무 타임라인·검토/지출관리/프로젝트/업무지시/보관함/최근 활동 운영을 통합합니다. 한국어 UI와 Asia/Seoul 기준 날짜 처리가 기본입니다.

Windows 사용자는 같은 포털을 `jdi-desktop/`(Electron 트레이 앱)으로도 씁니다. 화면과 기능은 전부 웹에서 불러오므로 **웹만 배포하면 데스크톱 앱에도 반영**됩니다.

## 스택

- Frontend: Next.js 16.2.11 App Router, React 19.2.4, TypeScript strict
- Styling: Tailwind CSS 4
- Backend: Supabase Auth, Postgres, RLS, Realtime, Storage, Edge Functions
- Runtime/Deploy: Node 22 이상, Railway
- Libraries: `@supabase/ssr`, `@hello-pangea/dnd`, `phosphor-react`, `recharts`, `sonner`, `xlsx`, `idb`, `pg`

## 명령

```bash
npm run dev
npm run build
npm run lint

npm run test:performance      # 성능·아키텍처 회귀 검사
npm run test:security
npm run test:expenses
npm run test:search-privacy
npm run perf:audit            # 빌드 후 라우트별 초기 JS 예산

npx supabase migration list --linked
npx supabase db push --linked
npx supabase functions deploy <name> --no-verify-jwt
```

루트 저장소의 `package.json`은 Railway/Railpack 감지를 위한 래퍼입니다. 앱 작업은 `jdi-portal`에서 진행합니다.

## 경로

| 목적 | 경로 |
|---|---|
| App Router | `src/app/` |
| 인증 페이지 | `src/app/(auth)/` |
| API Route Handler | `src/app/api/` |
| 대시보드 페이지 | `src/app/dashboard/` |
| 도메인 컴포넌트 | `src/components/dashboard/<domain>/` |
| 공용 컴포넌트 | `src/components/shared/` |
| 도메인 쿼리/액션/타입 | `src/lib/<domain>/` |
| Supabase SSR | `src/lib/supabase/` |
| DB 마이그레이션 | `supabase/migrations/NNN_*.sql` |
| Edge Function | `supabase/functions/<name>/index.ts` |
| 기능 설계/계획 | `docs/superpowers/specs/`, `docs/superpowers/plans/` |

## 아키텍처 메모

- 인증 세션 갱신은 `src/proxy.ts`와 `src/lib/supabase/middleware.ts` 흐름을 확인합니다. `middleware.ts`에는 **5분짜리 인증 검증 캐시**가 있어 매 요청마다 인증 서버로 나가지 않습니다. 이 캐시를 제거하면 전 화면이 느려집니다.
- 서버 컴포넌트는 `getAuthUser()`와 도메인 `queries.ts`를 통해 초기 데이터를 가져옵니다.
- 클라이언트 컴포넌트는 필요한 경우 도메인 `actions.ts`에서 Supabase client를 사용합니다. 보안은 RLS가 최종 방어선입니다.
- Postgres 직접 연결이 가능한 일부 서버 흐름은 `src/lib/db/postgres.ts`를 통해 fallback과 함께 동작합니다. 연결 실패 시 60초 동안 Supabase 경로로 우회합니다.
- 대시보드와 할일 초기 데이터는 **빠른 경로**(`src/lib/dashboard/fast-queries.ts`, `src/lib/tasks/fast-queries.ts`)와 **Supabase RPC 폴백**이 짝을 이룹니다. 초기 데이터를 바꾸면 반드시 **양쪽 다** 고칩니다. 실제 운영이 어느 쪽을 썼는지는 로그의 `source`로 확인합니다.
- `src/instrumentation.ts`가 서버 시작 시 pg 풀을 데우고 2분마다 keepalive를 보냅니다. 이게 없으면 유휴 후 첫 요청이 3~7초로 늘어납니다.
- 캐시가 있는 도메인은 stale 데이터가 UI를 덮어쓰지 않도록 로드 순서를 확인합니다.
- 무거운 라이브러리(`xlsx` 등)는 지연 로드하고, 라우트별 초기 JS 예산은 `npm run perf:audit`으로 확인합니다. `/api/health`는 인증을 거치지 않습니다.

## 보안 기준

- 모든 사용자 데이터는 RLS 정책을 기준으로 보호합니다.
- `is_approved_user()` 체크가 빠진 정책을 추가하지 않습니다.
- 관리자 기능은 서버 또는 RPC에서 권한을 다시 검증합니다.
- `SECURITY DEFINER` 함수는 `auth.uid()`와 권한 검증을 포함합니다.
- 민감 정보는 서버 환경 변수, Railway Variables, Supabase Secrets에만 둡니다.
- Storage 정책은 파일 소유자/멤버십/관리자 조건을 명확히 둡니다.

## 날짜와 시간

- 서비스 기준 시간대는 Asia/Seoul입니다.
- SQL에서 날짜 기준을 쓸 때는 `(NOW() AT TIME ZONE 'Asia/Seoul')::DATE`처럼 명시합니다.
- 클라이언트 날짜 포맷은 `src/lib/utils/date.ts`를 우선 사용합니다.
- 근태와 휴가 계산은 UTC 경계 문제를 먼저 의심합니다.

## 환경 변수

커밋 가능:

- `.env.local.example`

커밋 금지:

- `.env.local`
- Railway/Supabase 실제 키
- 서비스 role key
- VAPID private key
- DB 접속 문자열

현재 공개 변수:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

## 커밋 기준

커밋 메시지는 한 줄 요약을 명확히 씁니다.

예:

```text
문서: 에이전트 작업 지침 최신화
근태: KST 기준 출근 기록 계산 수정
채팅: DM 채널 읽음 상태 갱신 보완
```

사용자가 요청하지 않으면 push하지 않습니다.

## 자주 쓰는 유틸

- 날짜: `src/lib/utils/date.ts`
- 오류 메시지: `src/lib/utils/errors.ts`
- 파일 검증: `src/lib/utils/upload.ts`
- IP 처리: `src/lib/utils/ip.ts`
- 휴가 계산: `src/lib/utils/vacation.ts`
- 공용 프로필 타입: `src/lib/attendance/types.ts`
- 데스크톱 앱 여부 판별: `src/lib/hooks/useIsDesktopApp.ts`
- 로컬 캐시 일괄 삭제(로그아웃 등): `src/lib/cache/clearAllLocalCaches.ts`
- 성능 계측: `src/lib/performance/timing.ts`

## 환경 변수(서버 전용) 메모

- `DATABASE_URL` — 빠른 경로(pg 직접 연결)에 필요합니다. 없으면 조용히 Supabase 경로로만 동작해 느려집니다.
- `ACCOUNT_VAULT_KEY` — 보관함 계정 비밀번호 암복호 키. 값이 바뀌면 기존 저장 비밀번호를 못 읽습니다.
- Edge Function secrets와 VAPID private key는 Supabase Secrets에 둡니다.
