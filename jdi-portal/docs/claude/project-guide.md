# JDI 포털 — 프로젝트 가이드

> 필요할 때만 참고. 전체 읽지 말고 해당 섹션만 찾아 읽기.  
> 과거 사건/상세 배경은 `docs/claude/archive/past-lessons.md`.

## 개요

JDICOMPANY 사내 포털. 근태·할일·스케줄·오류접수·채팅·설정. 한국어 UI, Asia/Seoul. Railway 배포.

## 스택

- **Frontend**: Next.js 16 (App Router, Turbopack) + TypeScript 5 strict + React 19
- **Styling**: Tailwind 4, Glass morphism, brand blue (`--color-brand-600: #2563eb`)
- **Backend**: Supabase (Auth + DB + RLS + Edge Functions + Storage)
- **라이브러리**: @hello-pangea/dnd, sonner, phosphor-react
- **Lint**: ESLint 9
- **배포**: Railway Hobby ($5/월, 콜드 스타트 없음)

## 커맨드

```bash
npm run dev                                           # 개발 서버
npm run build                                         # 프로덕션 빌드
npm run lint                                          # ESLint
npx supabase db push --linked                         # DB 마이그레이션 (또는 node scripts/run-migration.mjs <file>)
npx supabase functions deploy <name> --no-verify-jwt  # Edge Function 배포
# 배포 상태/로그는 Railway Dashboard에서 확인 (자동 배포: master push 시)
```

## 경로 규약

| 용도 | 경로 |
|---|---|
| 도메인 코드 | `src/lib/{domain}/` (`queries.ts`, `actions.ts`, `types.ts`) |
| 페이지 (서버) | `src/app/dashboard/**/page.tsx` |
| 클라이언트 컴포넌트 | `src/components/dashboard/**/*.tsx` |
| 공유 컴포넌트 | `src/components/shared/` |
| 훅 / 유틸 | `src/lib/hooks/`, `src/lib/utils/` |
| DB 마이그레이션 | `supabase/migrations/NNN_*.sql` (순차 번호) |
| Edge Function | `supabase/functions/<name>/index.ts` (Deno) |
| 설계/계획 문서 | `docs/superpowers/specs/`, `docs/superpowers/plans/` |
| Path alias | `@/*` → `./src/*` |

## 아키텍처 핵심

- **Middleware**: Next.js 16이라 `middleware.ts` 대신 `src/proxy.ts`에서 `updateSession()`.
- **Data Layer**: `queries.ts`(SELECT, 서버 컴포넌트용, `SupabaseClient` 매개변수) / `actions.ts`(INSERT/UPDATE/DELETE, 클라이언트, 내부에서 `createClient()`).
  - `actions.ts`는 `"use server"` 아님. 브라우저에서 Supabase 직접 호출. 보안은 **RLS 담당**.
- **Server→Client**: `page.tsx`에서 `getAuthUser()` → `queries.ts` → props → 클라이언트 컴포넌트.
- **Auth**: `src/lib/supabase/auth.ts`의 `getAuthUser()` (React `cache()`로 중복 방지). Dashboard layout에서 `is_approved` 체크.
- **Notifications**: `src/lib/notifications/` (RPC `insert_notification*`). 발송 전 `notification_settings` 확인.
- **Web Push**: `src/lib/push/` + `supabase/functions/push-dispatch/` (Deno) + Database Webhook.

## 보안 (invariant)

- 모든 테이블 RLS에 `public.is_approved_user()` 체크 — 미승인 사용자 DB 레벨 차단.
- 출퇴근: SECURITY DEFINER RPC (`attendance_check_in/out`)만.
- 알림 생성: 관리자 전용 RPC (`admin_only` 체크).
- 프로필 UPDATE: 본인은 제한 필드만, role/is_approved는 전용 RPC.
- 파일 업로드: `src/lib/utils/upload.ts` `validateFile()` (10MB, 허용 확장자).

## 환경변수

- 프론트: `NEXT_PUBLIC_*` → Railway Variables + `.env.local`
- Edge Function: `npx supabase secrets set KEY=value`
- **커밋 금지**: 실제 키, `.env.local` / **커밋 OK**: `.env.local.example`
- 로컬 DB 작업용(선택): `.env.local`에 `DATABASE_URL`(Transaction pooler 문자열) 추가 → `node scripts/run-migration.mjs <file>`로 직접 실행 가능.
- 현재 등록된 NEXT_PUBLIC: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

## 커밋 규칙

형식:
```
<카테고리>: <한 줄 요약>

<왜 중심 1-3문장, 선택>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

카테고리: `DB:` / `UI:` / `API:` / `SW:` / `Edge Function:` / `타입:` / `설정:` / `픽스:` / `보안 픽스:` / `정리:` / `성능:` / `UX:` / `문서:` / `트리거:`

- 본문 **한국어**, HEREDOC 사용(한국어 깨짐 방지).
- `--no-verify`, `--amend`, `--force` 금지 (명시 요청 제외).
- `git push`는 사용자 확인 후.
- 매 commit이 롤백 가능한 단위.

## 절대 금지

- ❌ `tsconfig.json` include에 `supabase/functions/**`
- ❌ `.env.local` 커밋
- ❌ 사용자 허락 없이 master push

> DB/마이그레이션/RLS/Edge Function 관련 금지사항 → `supabase/CLAUDE.md` 참조.  
> 위 항목이 왜 금지인지 배경은 `docs/claude/archive/past-lessons.md` 참조.

## 공용 유틸/타입

- 날짜 (KST): `src/lib/utils/date.ts` — `toDateString`, `formatTime`, `formatMinutes`
- 에러: `src/lib/utils/errors.ts` — `getErrorMessage`
- 업로드: `src/lib/utils/upload.ts` — `validateFile`
- 프로필 공용 타입: `src/lib/attendance/types.ts`의 `Profile`
- 역할: `"employee"` | `"admin"` (`verifyAdmin` 패턴)
