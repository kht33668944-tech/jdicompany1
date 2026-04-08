# CLAUDE.md — JDI 포털

<!-- `/init` 금지. 이 파일은 수동 관리. -->

비개발자(김효태) 1인 운영 프로젝트. **이 파일은 지도만** 제공.
서브 문서는 **필요할 때만** Read로 열기 (항상 읽지 말 것).

## 필요할 때만 읽기

| 상황 | 파일 |
|---|---|
| 큰 기능 설계 / 여러 파일에 걸친 리팩토링 / 설계 판단이 필요한 경우만 | `docs/claude/workflow.md` |
| 기술 스택·경로·보안·커밋 규칙·함정을 실제로 모를 때 | `docs/claude/project-guide.md` |
| 사용자 응대 톤 재확인 | `docs/claude/user-profile.md` |
| 과거 실수 사례 상세 | `docs/claude/archive/past-lessons.md` |

> 1줄 수정·단순 버그픽스·명확한 작업은 **어떤 문서도 열지 말고 바로 진행**.

## 항상 적용 (최소 규칙)

- 사용자는 **비개발자** → 쉬운 말·비유·스크린샷 요청·단계별 안내.
- **답변은 최대한 간결하게**. 긴 글 싫어함 → 핵심만, 불필요한 서론·요약·반복 금지.
- 매 의미 있는 작업 단위마다 **commit**. `git push`는 **명시적 요청 시에만**.
- 파괴적 작업(삭제, force, prod DB 변경) 전 **확인 요청**.
- 스킬/에이전트 고정 X — 현재 가용한 것 중 상황에 맞게 선택.
- 큰 기능·불확실한 설계일 때만 brainstorm→plan→execute→verify 고려 (강제 X).

## 프로젝트 함정 (자주 깨지는 것만)

- Edge Function은 **Deno 네이티브**만 (`web-push` npm 금지 → `jsr:@negrel/webpush`)
- Supabase RPC의 `CURRENT_DATE` / `NOW()`는 **UTC** → KST는 `(NOW() AT TIME ZONE 'Asia/Seoul')::DATE`
- `tsconfig.json` exclude에 `supabase/functions/**` 필수
- 새 테이블엔 **RLS + `is_approved_user()` 체크** 필수
- `.env.local` 커밋 금지

상세/배경은 `docs/claude/project-guide.md`.
