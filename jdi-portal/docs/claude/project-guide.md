# JDI 포털 — 프로젝트 가이드

## 프로젝트 개요
JDICOMPANY 사내 포털 (jdi-portal) — 근태관리, 할일, 스케줄, 오류접수, 채팅, 설정.
한국어 UI (`lang="ko"`), Asia/Seoul 시간대. Vercel 배포.

## 기술 스택
- **Frontend**: Next.js 16.2.2 (App Router, Turbopack) + TypeScript 5 strict + React 19
- **Styling**: Tailwind CSS 4, Glass morphism, brand blue (`brand-50`~`900`, `--color-brand-600: #2563eb`)
- **Backend**: Supabase (Auth + DB + RLS + Edge Functions + Storage)
- **라이브러리**: @hello-pangea/dnd, sonner, phosphor-react 1.4.1 (→ @phosphor-icons/react 마이그레이션 예정)
- **Lint**: ESLint 9
- **배포**: Vercel (Hobby 티어)

## 커맨드
```bash
npm run dev      # 개발 서버 (Turbopack)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npx supabase db push --linked           # DB 마이그레이션 적용
npx supabase functions deploy <name> --no-verify-jwt  # Edge Function 배포
npx vercel ls                            # 배포 상태 확인
```

## 라우트 구조
| 경로 | 설명 |
|---|---|
| `/` | 랜딩 |
| `/(auth)/login,signup,forgot-password,reset-password` | 인증 |
| `/auth/callback,signout` | OAuth 콜백 |
| `/dashboard` | 홈 |
| `/dashboard/attendance` | 근태 |
| `/dashboard/tasks` (`[id]` 상세) | 할일 |
| `/dashboard/schedule` | 스케줄 |
| `/dashboard/chat` (`[channelId]` 대화방) | 채팅 |
| `/dashboard/reports` | 오류 접수 |
| `/dashboard/settings` | 설정 |

## 주요 경로
| 용도 | 경로 |
|---|---|
| 도메인 코드 | `src/lib/{tasks,chat,attendance,schedule,reports,notifications,push,settings,...}/` |
| 페이지 (서버) | `src/app/dashboard/**/page.tsx` |
| 클라이언트 컴포넌트 | `src/components/dashboard/**/*.tsx` |
| 공유 컴포넌트 | `src/components/shared/` |
| 훅 | `src/lib/hooks/` |
| 유틸 | `src/lib/utils/` (`date.ts`, `errors.ts`, `upload.ts`) |
| DB 마이그레이션 | `supabase/migrations/NNN_*.sql` (순차 번호) |
| Edge Function | `supabase/functions/<name>/index.ts` (Deno) |
| 설계 문서 | `docs/superpowers/specs/` |
| 구현 계획 | `docs/superpowers/plans/` |
| Claude 지침 | `docs/claude/` |

## 아키텍처 핵심

### Middleware (Next.js 16)
`src/proxy.ts`에서 `updateSession()` 호출 (Next.js 16은 `middleware.ts` 대신 `proxy.ts` 사용).

### Data Layer
도메인별 `src/lib/{domain}/` 구조:
| 파일 | 역할 | Supabase 클라이언트 |
|------|------|-------------------|
| `queries.ts` | SELECT (서버 컴포넌트용) | `SupabaseClient` 매개변수로 받음 |
| `actions.ts` | INSERT/UPDATE/DELETE (클라이언트용) | 내부에서 `createClient()` 직접 생성 |
| `types.ts` / `constants.ts` / `utils.ts` | 타입, 상수, 유틸 | — |

**중요**: `actions.ts`는 "use server" 서버 액션 아님. 브라우저에서 Supabase 직접 요청, RLS가 보안 담당.

### Server/Client Split
- **서버** (`src/app/dashboard/*/page.tsx`): `getAuthUser()` → `queries.ts` → props 전달
- **클라이언트** (`src/components/dashboard/`): 상태 관리, `actions.ts` 호출, `router.refresh()`로 갱신

### Auth
- `src/lib/supabase/auth.ts`의 `getAuthUser()` — React `cache()` 중복 방지, `AuthUser { user, profile, supabase }` 반환
- Dashboard layout에서 `is_approved` 체크 (미승인 → `/login?error=not_approved`)
- 클라이언트: `@/lib/supabase/client` / 서버: `@/lib/supabase/server` (async, cookies) / 미들웨어: `@/lib/supabase/middleware`

### Notifications
- `src/lib/notifications/` — Supabase RPC (`insert_notification`, `insert_notifications_batch`). Fire-and-forget
- 발송 전 `notification_settings` 확인해서 비활성화된 종류는 건너뜀
- **Web Push**: `src/lib/push/` + `supabase/functions/push-dispatch/` (Deno) + Database Webhook

### Security Model
- 모든 테이블 RLS에 `public.is_approved_user()` 체크 — 미승인 사용자 DB 레벨 차단
- 출퇴근: SECURITY DEFINER RPC만 (`attendance_check_in`, `attendance_check_out`)
- 알림 생성: 관리자 전용 RPC (`admin_only` 체크)
- 프로필 UPDATE: 본인은 제한 필드만, role/is_approved 변경은 전용 RPC
- 파일 업로드: `src/lib/utils/upload.ts` `validateFile()` (10MB, 허용 확장자)

## 커밋 메시지 규칙

### 형식
```
<카테고리>: <요약 한 줄>

<상세 설명 "왜" 중심, 1-3문장, 선택>

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
```

### 카테고리 접두어
- `DB:` 마이그레이션, RPC, 스키마
- `UI:` 컴포넌트, 페이지, 사용자 경험
- `API:` 서버 액션, 쿼리
- `SW:` Service Worker
- `Edge Function:` Supabase Edge Function
- `타입:` TypeScript 타입만
- `설정:` 환경변수, tsconfig, package.json
- `픽스:` 버그 수정 / `버그픽스:` 동의어
- `보안 픽스:` 보안 취약점
- `정리:` 리팩토링, 죽은 코드 제거
- `성능:` 성능 개선
- `UX:` 사용자 경험 개선
- `문서:` *.md, 주석
- `트리거:` 재배포용 빈 커밋

### 규칙
- 한국어 본문
- HEREDOC 형식 (한국어 깨짐 방지)
- `git push` 전 사용자 확인
- `--no-verify`, `--amend`, `--force` 금지 (명시 요청 제외)
- 매 commit이 롤백 가능해야 함

## 절대 금지
- ❌ 새 마이그레이션에 `public.is_approved_user()` RLS 체크 누락
- ❌ 새 테이블 만들고 SELECT/INSERT/UPDATE/DELETE 정책 안 만들기
- ❌ Edge Function에서 `web-push` npm 패키지 사용 (**Deno `crypto.ECDH` 미지원**) — 대체: `jsr:@negrel/webpush`
- ❌ `tsconfig.json` include에 `supabase/functions/**` 포함 (Deno 파일을 Next.js가 검사하면 빌드 실패)
- ❌ `.env.local` 커밋 (gitignore 있음)
- ❌ 사용자 명시적 허락 없이 master에 push
- ❌ Supabase RPC 내부에서 `CURRENT_DATE` / `NOW()` 사용 (UTC 기준) — 대체: `(NOW() AT TIME ZONE 'Asia/Seoul')::DATE`

## 알아둘 함정 (과거 실수 반복 방지)

### Next.js 16
- `middleware.ts` 대신 `proxy.ts` 사용
- Next.js 16 API 기존과 다를 수 있음 — 작성 전 `node_modules/next/dist/docs/` 확인
- TypeScript lib 정의 엄격 → `PushManager.subscribe`에 `as any` 캐스트 필요할 수 있음

### Supabase
- `CURRENT_DATE`는 UTC 기준. KST는 `(NOW() AT TIME ZONE 'Asia/Seoul')::DATE`
- `supabase.upsert()`는 INSERT + UPDATE 둘 다. RLS 양쪽 정책 필수
- RLS는 `is_approved_user()` 체크 필수
- Edge Function 배포 시 `--no-verify-jwt` 필요 (webhook이 JWT 없이 호출)

### Web Push (VAPID)
- VAPID 공개키 첫 글자 **`B`** 필수 (EC uncompressed point marker) — 복붙 시 잘리지 않게 주의
- 원시 base64url VAPID 키 → JWK 변환 후 `importVapidKeys` 호출
- `jsr:@negrel/webpush` (Deno 네이티브, Web Crypto API) 사용

### Service Worker
- 캐시 전략 변경 시 `CACHE_VERSION` 올려 자동 교체 유도

### Tailwind / Design System
- Glass morphism: `.glass-card`, `.glass-sidebar`, `.glass-header`
- 모서리: `rounded-2xl`~`3xl` 기본
- 그림자: `shadow-sm` 기본
- 모바일 터치 타겟 최소 44px (버튼 padding `py-2.5` 이상)
- 모달/드로어: `ModalContainer` 사용 (포커스 트랩, ESC 닫기 내장)

## 환경변수 관리
- 프론트: `NEXT_PUBLIC_*` → Vercel Dashboard + `.env.local`
- Edge Function: `npx supabase secrets set KEY=value`
- **절대 커밋 X**: 실제 키, `.env.local`
- **커밋 OK**: `.env.local.example` (placeholder만)
- 현재 등록된 NEXT_PUBLIC 변수:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

## 공용 유틸/타입
- 날짜: `src/lib/utils/date.ts` (KST 기준 — `toDateString`, `formatTime`, `formatMinutes` 등)
- 에러: `src/lib/utils/errors.ts` (`getErrorMessage`)
- 업로드: `src/lib/utils/upload.ts` (`validateFile`)
- 프로필: `src/lib/attendance/types.ts`의 `Profile` 공용 (work_start_time, work_end_time 포함)
- 역할: `"employee"` | `"admin"` (`verifyAdmin` 패턴)
- Path alias: `@/*` → `./src/*`

## 과거 교훈 (같은 실수 반복 방지)
| 마이그레이션/커밋 | 교훈 |
|---|---|
| `053` | `CURRENT_DATE`가 UTC → KST 사용자가 전날로 기록됨. `AT TIME ZONE 'Asia/Seoul'` 필수 |
| `054/055` | `push_subscriptions` UPDATE 정책 누락 → `upsert` RLS 실패. INSERT/UPDATE 양쪽 정책 필요 |
| Edge Function 초안 | `web-push` npm 사용 → Deno crypto.ECDH 미지원으로 런타임 에러. `@negrel/webpush` 교체 |
| Vercel 환경변수 초안 | VAPID 공개키 첫 글자 `B` 누락 → 브라우저 `applicationServerKey is not valid` |
| tsconfig 초안 | `supabase/functions` 포함 → Vercel TypeScript 체크가 Deno 파일 검사하려다 빌드 실패. exclude 필수 |
| 048 | schedule_participants RLS 재귀 (SELECT) |
| 052 | schedule_participants RLS 재귀 (DML) |
