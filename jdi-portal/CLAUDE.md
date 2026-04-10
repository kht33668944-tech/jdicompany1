# CLAUDE.md — JDI 포털

<!-- /init 금지. 이 파일은 수동 관리. -->

비개발자(김효태) 1인 운영 사내 포털. Next.js 16 + Supabase.
근태·할일·스케줄·오류접수·채팅·설정. 한국어 UI.

## 항상 적용 (공통 규칙)

- 사용자는 **비개발자** → 쉬운 말·비유·단계별 안내.
- **답변은 최대한 간결하게**. 핵심만, 불필요한 서론·요약·반복 금지.
- 매 의미 단위마다 **commit**. `git push`는 명시적 요청 시에만.
- 파괴적 작업(삭제, force, prod DB 변경) 전 **확인 요청**.
- 스킬/에이전트 고정 X — 상황에 맞게 선택.

## 프로젝트 함정 (자주 깨지는 것)

- Edge Function은 **Deno 네이티브**만 (`web-push` npm 금지)
- Supabase RPC의 `CURRENT_DATE`/`NOW()`는 **UTC** → KST 변환 필수
- `tsconfig.json` exclude에 `supabase/functions/**` 필수
- 새 테이블엔 **RLS + `is_approved_user()` 체크** 필수
- `.env.local` 커밋 금지

## 문서 인덱스

| 문서 | 내용 | 언제 읽나 |
|---|---|---|
| [`docs/claude/project-guide.md`](docs/claude/project-guide.md) | 스택·경로·아키텍처·보안·커밋·유틸 | 기술 규칙/경로/보안 확인 시 |
| [`docs/claude/workflow.md`](docs/claude/workflow.md) | brainstorm→plan→execute→verify | 큰 기능 설계·멀티파일 리팩토링 시 |
| [`docs/claude/user-profile.md`](docs/claude/user-profile.md) | 사용자 톤·의사소통 규칙 | 응대 톤 재확인 시 |
| [`docs/claude/archive/past-lessons.md`](docs/claude/archive/past-lessons.md) | 과거 실수 사례와 배경 | 함정 규칙의 "왜?"가 필요할 때 |
| [`AGENTS.md`](AGENTS.md) | 코드리뷰 체크리스트 (8항목) | 코드리뷰 요청 시 |

> 1줄 수정·단순 버그픽스·명확한 작업은 **어떤 문서도 열지 말고 바로 진행**.

### 폴더별 CLAUDE.md

| 경로 | 요약 | 언제 읽나 |
|---|---|---|
| [`supabase/CLAUDE.md`](supabase/CLAUDE.md) | 마이그레이션·RLS·Edge Function 규칙 | DB/마이그레이션/RLS 변경 시 |
| [`src/components/dashboard/chat/CLAUDE.md`](src/components/dashboard/chat/CLAUDE.md) | Realtime 구독·캐싱·읽음 처리 | 채팅 기능 수정 시 |
| [`src/components/dashboard/tasks/CLAUDE.md`](src/components/dashboard/tasks/CLAUDE.md) | IDB 캐시·Position RPC·패널/페이지 모드 | 할일 기능 수정 시 |
| [`src/components/dashboard/attendance/CLAUDE.md`](src/components/dashboard/attendance/CLAUDE.md) | KST 타임존·IP 검증·승인 워크플로우 | 근태 기능 수정 시 |

### 설계/계획 문서

| 경로 | 용도 |
|---|---|
| `docs/superpowers/specs/` | 기능 설계서 (brainstorm 결과) |
| `docs/superpowers/plans/` | 구현 계획서 (plan 결과) |

## 읽기 우선순위 (작업 유형별)

| 작업 유형 | 읽을 문서 |
|---|---|
| 1줄 수정·단순 버그픽스 | **아무것도 읽지 말고 바로 진행** |
| DB 마이그레이션·RLS 변경 | `supabase/CLAUDE.md` |
| 채팅 기능 수정 | `src/components/dashboard/chat/CLAUDE.md` |
| 할일 기능 수정 | `src/components/dashboard/tasks/CLAUDE.md` |
| 근태 기능 수정 | `src/components/dashboard/attendance/CLAUDE.md` |
| 새 기능 전체 설계 | `docs/claude/workflow.md` → `project-guide.md` |
| 코드리뷰 | `AGENTS.md` |
| 보안·경로·커밋 규칙 확인 | `docs/claude/project-guide.md` |

## 새 규칙 추가 위치

| 규칙 종류 | 추가 위치 |
|---|---|
| 전체 프로젝트 공통 | 이 파일의 "항상 적용" 또는 "프로젝트 함정" |
| 기술 상세 (경로, 보안, 커밋 등) | `docs/claude/project-guide.md` |
| DB·마이그레이션·RLS | `supabase/CLAUDE.md` |
| 채팅 realtime | `src/components/dashboard/chat/CLAUDE.md` |
| 과거 사건 기록 | `docs/claude/archive/past-lessons.md` |
| 새 도메인 고유 규칙 | 해당 폴더에 CLAUDE.md 신규 생성 (규칙 5개 이상일 때만) |

## 문서 변경 정책

**코드 수정은 바로 진행 가능.** 단, 아래 항목은 **수정 전 반드시 사용자 승인 필수**:

- 루트 `CLAUDE.md` 수정
- `docs/` 문서 구조 변경 (생성·삭제·이동)
- 폴더별 `CLAUDE.md` 생성 또는 수정
- 프로젝트 작업 규칙·문서 운영 규칙 변경

**승인 요청 형식** (3줄 이내):
1. **무엇을**: 어떤 파일의 어떤 부분을 변경
2. **왜**: 변경 이유
3. **해도 될까요?**
