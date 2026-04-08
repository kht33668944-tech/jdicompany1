# CLAUDE.md — JDI 포털 작업 지도

<!--
이 파일은 **수동으로 관리**됩니다. `/init` 명령을 돌리지 마세요.
`/init`은 이 파일을 자동 생성된 내용으로 덮어쓰며 지도 구조가 사라집니다.
-->

비개발자(김효태) + Claude Code 협업 프로젝트. **이 파일은 지도만** 제공합니다.
세부 내용은 필요한 상황에 맞춰 아래 서브 파일을 Read 도구로 열어 확인하세요.

## 상황별 읽을 파일

| 상황 | 읽을 파일 |
|---|---|
| 새 기능 / 리팩토링 / 큰 버그 픽스 시작 | `docs/claude/workflow.md` |
| 사용자 대응·설명 방식 확인 | `docs/claude/user-profile.md` |
| 기술 스택·파일 위치·커밋 규칙·금지사항·함정 | `docs/claude/project-guide.md` |

## 최소 규칙 (항상 적용)

- 사용자는 **비개발자**. 쉬운 말과 비유로 설명.
- 새 기능은 반드시 **brainstorm → plan → execute → verify** 순서.
- **스킬/에이전트는 고정 X**. 현재 가용한 것 중 상황에 맞는 것을 선택.
- 매 task 후 commit. **`git push`는 명시적 요청 시에만**.
- 파괴적 작업(prod 배포, 삭제, force 작업) 전 확인 요청.
- 진행 중 오래 걸릴 때는 "진행 중" 상태를 표시.

## 중요 함정 (같은 실수 반복 방지)

- Edge Function은 **Deno 네이티브 라이브러리만** (`web-push` npm 금지)
- Supabase RPC의 `CURRENT_DATE`는 UTC → KST 필요 시 `(NOW() AT TIME ZONE 'Asia/Seoul')::DATE`
- `tsconfig.json` exclude에 `supabase/functions/**` 필수
- VAPID 공개키 복붙 시 첫 글자 `B` 보존
- `.env.local` 절대 커밋 X / `.env.local.example` 만 커밋

상세: `docs/claude/project-guide.md`
