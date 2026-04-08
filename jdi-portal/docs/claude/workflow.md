# 작업 흐름 (옵션)

> **이 문서는 큰/불확실한 작업일 때만 참고**.  
> 단순 버그픽스, 1~2파일 수정, 이미 경로가 명확한 작업은 **이 문서를 읽지 말고 바로 진행**.

큰 기능·여러 도메인 걸친 리팩토링·설계 판단 필요 시 다음 단계를 "가이드"로 참고.  
단계마다 특정 스킬 이름을 고정하지 말고 **현재 세션에서 가용한 스킬 중 역할에 맞는 것**을 고른다.

## 1. Brainstorm — 요구사항 설계
- 역할: 한 번에 하나씩 질문하며 요구사항/설계 결정을 수집.
- 키워드: brainstorming, interview, scoping
- 결과물: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- 한 번에 **한 질문만** (A/B/C + 추천 이유 포함), 기술 용어는 비유로.
- 끝나면 commit.

## 2. Plan — 구현 계획
- 역할: design 문서 → 2~5분 bite-sized task 리스트로 변환.
- 키워드: plan, writing-plans, architect
- 결과물: `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`
- task는 literal 코드(placeholder 금지), 수동 단계는 명시 분리, 파일 경로·검증 명령 포함.
- 끝나면 commit.

## 3. Execute — 실행
- 역할: plan의 각 task를 적절한 에이전트/본인 손으로 실행.
- 키워드: executor, subagent-driven, executing-plans, autopilot
- 모델: 단순→Sonnet, 복잡(Edge Function·암호화·멀티파일 리팩토링)→Opus
- 매 task 후 **즉시 commit**. `git push`는 끝에서 한 번 또는 사용자 요청 시만.

### 3-1. 병렬 실행 (독립 task가 여럿일 때만)
- **판단 기준**: task끼리 서로의 결과/파일을 공유하지 않으면 병렬 OK. 한쪽이 다른 쪽 결과에 의존하면 **순차**가 더 빠르고 안전.
- 병렬에 적합: 서로 다른 기능 동시 개발, 관련 없는 여러 버그 동시 픽스, 독립 컴포넌트 여러 개 신규 생성.
- 병렬 부적합: 단일 기능을 단계별로 쌓아가는 작업(데이터 모델→lib→UI→관리자 화면처럼 의존 체인이 있는 경우).
- 키워드: ultrawork(처리량 우선), team(분업/협력), dispatching-parallel-agents(가이드)
- 헷갈리면 그냥 순차로 진행. 의존성 있는 작업을 억지로 병렬화하면 충돌·재작업으로 더 느려짐.

## 4. Verify — 검증
- 역할: 실제 환경에서 동작 확인.
- 키워드: verification, verifier, qa
- opt-in 기능이면 **배포 후 실환경 검증**이 정확 (iOS PWA, HTTPS 필요 기능).
- 에러 조사 순서: Vercel 빌드 로그 → 브라우저 콘솔 → Edge Function 로그 → DB.

## 부가 — 필요할 때만
- **디버깅**: systematic-debugging / debugger / tracer 류
- **문서/API 확인**: context7 MCP / document-specialist
- **보안 변경**: security-reviewer

## 배포 안전
- opt-in 기능: 바로 production 배포 OK.
- 파괴적 변경(drop, 기존 API 변경): 사용자 확인 필수.
- 매 commit은 롤백 가능해야 함.

> 커밋 규칙·절대 금지·경로 규약은 `docs/claude/project-guide.md`.  
> 사용자 응대 톤은 `docs/claude/user-profile.md`.
