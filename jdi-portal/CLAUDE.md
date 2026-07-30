# CLAUDE.md - JDI 포털 작업 지침

이 파일은 Claude 계열 에이전트가 빠르게 프로젝트 맥락을 잡기 위한 요약입니다. Codex는 `AGENTS.md`를 우선으로 보되, 이 파일도 같은 프로젝트 지침으로 취급합니다.

## 항상 적용

- 사용자는 비개발자 운영자입니다. 어려운 기술 설명보다 쉬운 한국어와 짧은 단계 안내를 우선합니다.
- 코드는 안정성을 먼저 봅니다. 특히 인증, RLS, 날짜, 운영 데이터 변경은 보수적으로 처리합니다.
- 사용자가 요청하지 않은 `git push`, 강제 푸시, 히스토리 재작성은 하지 않습니다.
- `.env.local`과 실제 키 값은 커밋하지 않습니다.
- 위험 작업은 실행 전 확인합니다. 예: 운영 DB 변경, 데이터 삭제, 권한 완화, 배포 설정 변경.

## 문서 인덱스

| 문서 | 용도 |
|---|---|
| `../CLAUDE.md` (저장소 루트) | 저장소 구조, 아키텍처 큰 그림, **성능 불변조건** |
| `AGENTS.md` | Codex/공통 에이전트 작업 지침 |
| `README.md` | 프로젝트 시작과 구조 안내 |
| `docs/claude/project-guide.md` | 스택, 경로, 아키텍처, 보안 기준 |
| `docs/claude/workflow.md` | 설계, 계획, 구현, 검증 흐름 |
| `docs/claude/user-profile.md` | 사용자와 커뮤니케이션 방식 |
| `docs/performance/production-baseline.md` | 성능 기준선과 확인 절차 |
| `docs/operations/backup-and-recovery.md` | 백업·복구 운영 절차 |
| `docs/operations/cloud-run-seoul.md` | 서울 리전 배포(Cloud Run) 구성·배포·롤백 |
| `supabase/CLAUDE.md` | DB, RLS, Edge Function 규칙 |
| `src/components/dashboard/attendance/CLAUDE.md` | 근태 도메인 규칙 |
| `src/components/dashboard/chat/CLAUDE.md` | 채팅 도메인 규칙 |
| `src/components/dashboard/tasks/CLAUDE.md` | 업무 도메인 규칙 |
| `../jdi-desktop/README.md` | Windows 데스크톱 앱(껍데기) 규칙과 배포 |

## 빠른 프로젝트 정보

- 앱 위치: `jdi-portal/`
- 프레임워크: Next.js 16.2.11 App Router, React 19.2.4 (Next 16이라 `middleware.ts` 대신 **`src/proxy.ts`**)
- 언어: TypeScript strict, Node ≥ 22
- 스타일: Tailwind CSS 4
- 백엔드: Supabase Auth, Postgres, RLS, Storage, Realtime, Edge Functions
- 데이터 접근: Supabase SSR 클라이언트가 기본, 일부 성능 민감 경로는 `pg` 직접 연결 + 폴백 (`src/lib/db/postgres.ts`)
- 배포: **GCP Cloud Run 서울(`asia-northeast3`)** — 프로젝트 `jdi-portal-seoul`, 서비스 `jdi-portal`. 루트에서 `gcloud builds submit --config cloudbuild.yaml` 로 **수동** 배포(자동 트리거 없음). `jdiportal.com` 은 Cloudflare Worker 가 전달. 절차·롤백·비용은 `docs/operations/cloud-run-seoul.md`. (2026-07-30 Railway 싱가포르에서 이전, Railway 배포는 중지)
- 데스크톱: `jdi-desktop/` Electron 껍데기 — 웹만 고치면 자동 반영
- UI 언어와 날짜 기준: 한국어, Asia/Seoul

## 자주 쓰는 명령

```bash
npm run dev
npm run build
npm run lint

# 검증 (node:test 기반, jest/vitest 아님)
npm run test:performance      # 성능·아키텍처 회귀 검사 — 코드 수정 후 필수
npm run test:security         # 보안 회귀
npm run test:expenses         # 지출관리
npm run test:search-privacy   # 검색 프라이버시
npm run perf:audit            # 라우트별 초기 JS 예산 (빌드 후)

# Supabase
npx supabase migration list --linked                   # 새 번호 잡기 전 원격 적용 상태 확인
npx supabase db push --linked
npx supabase functions deploy <name> --no-verify-jwt
```

루트 저장소에서 실행하면 래퍼 스크립트가 `jdi-portal`로 이동합니다. 세부 작업은 보통 `jdi-portal` 안에서 진행합니다.

## 작업 우선순위

1. 단순 버그나 작은 수정은 관련 파일을 읽고 바로 처리합니다.
2. 여러 도메인에 걸친 기능은 `docs/claude/workflow.md` 흐름대로 설계와 계획을 남깁니다.
3. DB, RLS, Edge Function은 `supabase/CLAUDE.md`를 먼저 확인합니다.
4. 도메인별 기존 규칙이 있으면 해당 하위 `CLAUDE.md`를 먼저 확인합니다.

## 금지/주의

- **성능 불변조건을 되돌리지 않습니다.** 미들웨어 인증 캐시(`src/lib/supabase/middleware.ts`), keepalive(`src/instrumentation.ts`), 빠른 경로+폴백(`src/lib/*/fast-queries.ts`), 대시보드 업무 요약 사전 필터 — 자세한 내용은 저장소 루트 `CLAUDE.md`. 코드 수정 후 `npm run test:performance`로 확인합니다.
- 대시보드 초기 데이터를 건드리면 **빠른 경로와 Supabase RPC 폴백 양쪽**을 함께 고칩니다. 한쪽만 고치면 운영에 반영되지 않거나 회귀 테스트가 실패합니다.
- `tsconfig.json`의 `exclude`에서 `supabase/functions/**`를 제거하지 않습니다.
- SQL에서 `CURRENT_DATE`, `NOW()`를 KST 변환 없이 직접 사용하지 않습니다.
- 클라이언트 코드에 서버 전용 키를 노출하지 않습니다.
- RLS를 우회하거나 완화하는 변경은 명확한 근거 없이 하지 않습니다.
- Supabase `error`를 무시하고 `data`만 처리하지 않습니다.
