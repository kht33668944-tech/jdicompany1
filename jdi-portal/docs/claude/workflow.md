# 작업 흐름

새 기능, 리팩토링, 큰 버그 픽스 — 1줄 수정이 아닌 모든 작업은 이 4단계 순서.

> **스킬 선택 원칙**: 아래 각 단계마다 "이런 역할의 스킬"이 필요하다고 설명한다.
> 특정 스킬 이름을 고정하지 말고, **현재 세션에서 가용한 스킬 목록**을 보고
> 해당 단계 역할에 가장 잘 맞는 것을 골라 사용한다. (예시로 적어둔 스킬은
> 참고용이며 더 나은 스킬이 있으면 그것을 쓴다.)

## 1. Brainstorm (요구사항 설계)
- **역할**: 한 번에 한 질문씩 물어 요구사항/설계 결정을 수집하고 design 문서를 생성하는 스킬.
- **찾을 키워드**: brainstorming, design, interview, requirements, scoping
- **예시 스킬**: `superpowers:brainstorming`, `oh-my-claudecode:deep-interview`, `oh-my-claudecode:planner` (interview 모드)
- **결과물**: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- **진행 방식**:
  - 한 번에 **한 질문만** (멀티초이스 A/B/C 선호)
  - 각 옵션에 추천 이유 포함
  - 사용자가 비개발자 → 기술 용어를 비유로 설명
- 끝나면 commit.

## 2. Plan (구현 계획)
- **역할**: design 문서를 기반으로 bite-sized(2-5분) 단위 실행 계획 문서를 생성하는 스킬.
- **찾을 키워드**: plan, writing-plans, planner, architect
- **예시 스킬**: `superpowers:writing-plans`, `oh-my-claudecode:planner`, `oh-my-claudecode:architect`
- **결과물**: `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`
- **진행 방식**:
  - 각 task는 2-5분 bite-sized
  - 코드는 literal (TODO/placeholder 금지)
  - 수동 단계(사용자 클릭)는 명확히 분리 표시
  - 파일 경로, 커밋 메시지, 검증 명령 명시
- 끝나면 commit.

## 3. Execute (서브에이전트 실행)
- **역할**: 구현 계획의 각 task를 fresh-context 서브에이전트에게 위임하며 매 task 후 리뷰하는 스킬.
- **찾을 키워드**: subagent-driven, executing-plans, execute, autopilot, ralph, ultrawork
- **예시 스킬**: `superpowers:subagent-driven-development`, `superpowers:executing-plans`, `oh-my-claudecode:autopilot`, `oh-my-claudecode:ralph`
- **실행 에이전트 (예시)**: `oh-my-claudecode:executor`
- **진행 방식**:
  - `TaskCreate`로 전체 task 등록
  - 각 task를 적절한 executor 서브에이전트에 위임 (fresh context)
  - 의존성 있는 task(같은 모듈 파일들)는 **묶어서** 한 에이전트에게
- **모델 선택**:
  - 단순 (타입 추가, 파일 생성, SQL 작성) → **Sonnet**
  - 보통 (UI, 통합, 기존 파일 수정) → **Sonnet**
  - 복잡 (Edge Function, 암호화, 설계 판단, 멀티파일 리팩토링) → **Opus**
- 매 task 후 결과 리뷰 → 다음 task
- 매 task 후 **즉시 commit**. `git push`는 끝에서 한 번 또는 명시적 요청 시만.

## 4. Verify (E2E 검증)
- **역할**: 완성된 코드가 실제 환경에서 동작하는지 검증하는 스킬.
- **찾을 키워드**: verification, verifier, qa, test-engineer, ultraqa
- **예시 스킬**: `superpowers:verification-before-completion`, `oh-my-claudecode:verifier`, `oh-my-claudecode:qa-tester`, `oh-my-claudecode:ultraqa`
- **원칙**: opt-in 기능이고 기본 OFF면 **먼저 production 배포 후 검증**이 더 정확 (특히 iOS PWA, HTTPS 필수 기능)
- **방법**: 사용자가 실제 폰/PC에서 동작 확인
- **에러 시 확인 순서**:
  1. Vercel 빌드 로그 (`npx vercel inspect <url> --logs`)
  2. 브라우저 콘솔
  3. Edge Function 로그 (Supabase 대시보드 → Functions → Logs)
  4. DB 상태 (SQL Editor로 관련 테이블 조회)
- 버그 수정 → 재배포 → 재검증 루프

## 부가 고려 사항

### 디버깅이 필요할 때
복잡한 버그/실패 상황에서는 별도로 디버깅 성격의 스킬을 활용.
- **찾을 키워드**: debugging, debugger, tracer, systematic
- **예시 스킬**: `superpowers:systematic-debugging`, `oh-my-claudecode:debugger`, `oh-my-claudecode:tracer`

### 외부 문서/API 참조가 필요할 때
- **찾을 키워드**: documentation, context7, document-specialist
- **예시 도구**: `context7` MCP, `oh-my-claudecode:document-specialist`
- Next.js 16, Supabase, Deno 등 최신 API는 학습 데이터보다 문서가 정확

### 보안 민감 변경
- **찾을 키워드**: security-reviewer, security
- **예시 스킬**: `oh-my-claudecode:security-reviewer`
- RLS, 인증, 암호화 관련 변경 후 리뷰

## 배포 안전 원칙
- **opt-in 기능** (기본 OFF, 기존 동작 건드리지 않음): 바로 production 배포 OK
- **파괴적 변경** (테이블 drop, 기존 API 변경): 반드시 사용자 확인 + staging/브랜치
- `git push`는 **워크플로우 마지막**에 한 번 또는 **명시적 요청** 시에만
- 매 commit이 롤백 가능한 단위여야 함

## 공통 규칙
- 커밋 메시지는 `docs/claude/project-guide.md`의 커밋 규칙 참조
- 설계 문서(spec)도 git에 포함 — 나중 참조 + 같은 실수 방지
- 절대 금지 사항은 `docs/claude/project-guide.md` 참조
- 사용자 대응 방식은 `docs/claude/user-profile.md` 참조
