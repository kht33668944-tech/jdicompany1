# Tasks 도메인 규칙

## IndexedDB 캐시 (`tasksCache.ts`)

- 모든 캐시 함수는 IDB 없어도 동작 (프라이빗 모드, Safari 등 graceful degradation)
- **`freshLoadedRef` 가드 필수** — 서버 fetch 완료 후 IDB의 stale 데이터가 덮어쓰지 않도록 방지
- 캐시 키는 `"all"` 단일 키. 부분 갱신 없이 전체 교체

## Position 관리

- Position은 **status별 독립** — `"대기"`, `"진행중"`, `"완료"` 각각 별도 순서
- 상태 변경 시 반드시 `reorder_task` RPC 사용. 직접 position UPDATE 금지
- RPC 없이 쿼리하면 position 값이 stale 상태

## 패널 모드 vs 페이지 모드

- `TaskDetailClient`의 `mode` prop으로 분기
- `"panel"`: 슬라이드 드로어 → `onRefresh()` 콜백으로 부모 갱신
- `"page"`: 전체 페이지 → `router.refresh()`로 갱신
- 혼용하면 갱신 누락 발생

## 완료 태스크 표시 제한

- 메인 리스트는 최근 7일 완료분만 표시 (`getCompletedCutoff()`)
- 요약 카운트(`TaskSummaryPanel`)는 전체 완료 포함 — 수치 불일치 의도된 동작

## 알림

- `createNotification()`은 fire-and-forget — 실패해도 뮤테이션 블로킹 안 함
- 할당 시 → 담당자에게, 상태 변경 → 생성자에게, 댓글 → 담당자 전원(작성자 제외)

## 실시간 구독

- `TaskDetailClient`에서 `task_activities` 테이블만 Realtime 구독
- 중복 방지: `prev.some(a => a.id === data.id)` 체크
- 태스크 목록은 실시간 구독 없음 — IDB 캐시 + 수동 새로고침
