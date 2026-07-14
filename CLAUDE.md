# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 저장소 구조

이 저장소는 **래퍼(wrapper)** 입니다. 실제 앱은 `jdi-portal/` 하위에 있습니다.

- 루트 `package.json`은 Railway/Railpack이 Node 프로젝트를 감지하고 하위 앱을 빌드하도록 두는 얇은 래퍼입니다. 루트 스크립트는 `jdi-portal`로 진입해 실행합니다.
- **거의 모든 작업(코드, 문서, Supabase, 테스트)은 `jdi-portal/` 안에서 진행합니다.**
- 앱 작업 전 `jdi-portal/CLAUDE.md`와 `jdi-portal/AGENTS.md`를 먼저 읽습니다. 도메인/DB 작업은 아래 계층별 문서를 우선 확인합니다.

## 명령

루트에서도 동작하지만, 세부 작업은 `cd jdi-portal` 후 실행하는 것이 기본입니다.

```bash
npm run dev      # 개발 서버 (localhost:3000)
npm run build    # 프로덕션 빌드
npm run start    # 빌드 결과 실행
npm run lint     # ESLint (eslint-config-next + typescript)

# 테스트 (jdi-portal 안에서만, node:test 기반 — jest/vitest 아님)
npm run test:search-privacy   # 검색 프라이버시 회귀 검사 (scripts/check-search-privacy.mjs)
npm run perf:audit            # 성능 감사 (scripts/performance-audit.mjs)
npm run test:performance      # 성능/아키텍처/로그인 성능 테스트 스위트
#   단일 테스트 파일: node --test scripts/<파일>.test.mjs

# Supabase
npx supabase db push --linked                          # 마이그레이션 적용
npx supabase functions deploy <name> --no-verify-jwt   # Edge Function 배포
```

TypeScript는 strict입니다. `@/*` → `jdi-portal/src/*`. Node ≥ 22.

## 아키텍처 (여러 파일을 읽어야 파악되는 큰 그림)

**도메인 모듈 패턴** — 각 기능 도메인은 세 계층으로 일관되게 나뉩니다. 새 기능/수정 시 이 세 위치를 함께 봅니다.
- `src/app/dashboard/<domain>/page.tsx` — 서버 컴포넌트. 초기 데이터를 서버에서 로드.
- `src/lib/<domain>/{queries,actions,types,constants}.ts` — `queries.ts`(읽기), `actions.ts`(쓰기), `types.ts`(도메인 타입). 일부 도메인엔 `*Cache.ts`(예: `tasks/tasksCache.ts`).
- `src/components/dashboard/<domain>/` — 도메인 UI. 여기 하위 `CLAUDE.md`가 있으면 우선.

도메인 목록: `attendance`(근태), `tasks`(업무), `chat`(채팅), `schedule`(일정), `reports`(리포트), `influencer`(인플루언서), `work-timeline`, `settings`, `notifications`, `push`.

**이중 데이터 접근 — 이 앱의 핵심 특징.** 두 경로가 공존하며, 보안의 최종 방어선은 항상 RLS입니다.
- **Supabase (기본)**: `src/lib/supabase/`의 SSR 클라이언트. `server.ts`(서버 컴포넌트/Route Handler, 쿠키 기반), `client.ts`(브라우저, 캐시된 싱글턴), `middleware.ts`(세션 갱신), `auth.ts`(`getAuthUser()` 등). RLS + `public.is_approved_user()`로 접근 제어.
- **직접 Postgres (`pg` Pool)**: `src/lib/db/postgres.ts`. 일부 성능 민감 서버 흐름에서 `DATABASE_URL`로 직접 연결. **fallback 설계가 핵심** — 연결 실패 시 `markPostgresUnavailable()`로 60초간 차단하고 Supabase 경로로 우회. `src/instrumentation.ts`가 Railway 프로세스 시작 시 풀을 warm-up 합니다.

**인증/세션 흐름**: Next.js 16이라 `middleware.ts`가 아니라 **`src/proxy.ts`** 가 진입점입니다(`src/lib/supabase/middleware.ts`의 `updateSession` 호출). 승인된 사용자만 대시보드 접근.

**Edge Functions** (`supabase/functions/`, **Deno 런타임** — Node 전용 패키지 금지): `influencer-analyze`, `influencer-extract`(인플루언서 자동 분석), `push-dispatch`(웹 푸시). PWA/웹 푸시는 `src/lib/push/`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

**마이그레이션**: `supabase/migrations/NNN_설명.sql` 순차 번호. 현재 최신은 **`087_dashboard_task_summary_rpc.sql`** — 기존 파일 수정 대신 다음 번호로 **추가**합니다.

## 반드시 지킬 제약

- **KST 날짜**: 서비스 기준은 Asia/Seoul. SQL에서 `CURRENT_DATE`/`NOW()`를 그대로 쓰지 말고 `(NOW() AT TIME ZONE 'Asia/Seoul')::DATE`로 명시. 클라이언트 날짜는 `src/lib/utils/date.ts` 우선. 근태/휴가 버그는 UTC 경계를 먼저 의심.
- **RLS**: 사용자 데이터 테이블은 RLS 활성 + `is_approved_user()` 반영. `SECURITY DEFINER` 함수는 내부에서 `auth.uid()`와 권한을 재검증. RLS 완화는 명확한 근거 없이 금지.
- **Supabase 응답**: `error`를 무시하고 `data`만 처리하지 않습니다.
- **서버/클라이언트 경계**: `"use client"`는 필요한 곳에만. `metadata` export는 클라이언트 컴포넌트에 두지 않음. 서버 전용 키를 클라이언트에 노출하지 않음.
- **`tsconfig.json`의 `exclude`에서 `supabase/functions/**`를 제거하지 않습니다** (Deno 코드가 Next 빌드에 섞이지 않도록).
- 공용 유틸을 우선 사용: 날짜 `date.ts`, 오류 `errors.ts`, 업로드 검증 `upload.ts`, IP `ip.ts`, 휴가 `vacation.ts` (모두 `src/lib/utils/`).
- 사용자가 요청하지 않은 `git push`/강제 푸시/히스토리 재작성 금지. `.env.local`·실제 키 커밋 금지.

## 문서 계층 (작업 전 확인 순서)

| 문서 | 용도 |
|---|---|
| `jdi-portal/CLAUDE.md` · `jdi-portal/AGENTS.md` | 앱 전반 작업 지침, 리뷰 기준 |
| `jdi-portal/docs/claude/project-guide.md` | 스택, 경로, 아키텍처, 보안 기준 |
| `jdi-portal/docs/claude/workflow.md` | 설계→계획→구현→검증 흐름 |
| `jdi-portal/supabase/CLAUDE.md` | DB, RLS, SECURITY DEFINER, Edge Function, Storage 규칙 |
| `src/components/dashboard/{attendance,chat,tasks}/CLAUDE.md` | 해당 도메인 규칙 |
| `jdi-portal/docs/superpowers/{specs,plans}/` | 기능 설계·구현 계획 기록 |

## 사용자/커뮤니케이션

사용자는 **비개발자 운영자**입니다. 화면 문구와 설명은 쉬운 한국어로, 짧은 단계로 안내합니다. 위험 작업(운영 DB 변경, 데이터 삭제, 권한 완화, 배포 설정 변경)은 실행 전 의도를 확인합니다.
