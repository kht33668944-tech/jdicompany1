# 업무 도메인 지침

업무 도메인은 목록 캐시, 상세 패널, Realtime 활동 기록, position 정렬이 핵심입니다.

## 주요 파일

- 목록 화면 본체: `src/components/dashboard/tasks/TasksPageClient.tsx`
- 대시보드 오늘 업무 위젯: `src/components/dashboard/widgets/TodayWorkBoardWidget.tsx`, `MyTasksWidget.tsx`
- 상세: `src/components/dashboard/tasks/detail/TaskDetailClient.tsx` (+ 첨부·체크리스트·댓글·활동)
- 페이지: `src/app/dashboard/tasks/`
- 로직: `src/lib/tasks/` (빠른 경로는 `fast-queries.ts`)
- 캐시: `src/lib/tasks/tasksCache.ts`

목록/타임라인/캘린더 표시는 모두 `TasksPageClient.tsx` 안에 있습니다. (`src/components/dashboard/schedule/ListView.tsx`는 일정 도메인의 별개 파일입니다 — 이름이 비슷하니 혼동 주의.)

## 캐시

- IndexedDB 캐시는 현재 **쓰기 전용**입니다. 목록을 불러온 뒤 저장(`cacheTasks`)하고 로그아웃 때 지우기만(`clearTasksCache`) 합니다.
- 초기 목록은 서버 빠른 경로(`src/lib/tasks/fast-queries.ts`)가 내려주므로 캐시를 먼저 그리는 경로는 없습니다.
- 캐시를 화면에 다시 쓰게 만든다면, 서버 fetch가 끝난 뒤 stale 캐시가 화면을 덮지 않도록 순서를 확인합니다.

## Position

- position은 상태별로 독립된 순서를 가집니다.
- 상태 변경과 드래그 정렬은 `reorder_task` RPC 흐름을 우선합니다.
- 클라이언트에서 직접 position만 UPDATE하면 중복/충돌이 생길 수 있습니다.

## 상세 패널과 페이지

- `TaskDetailClient`는 `mode`로 패널과 페이지 흐름을 나눕니다.
- 패널 모드는 부모 목록 갱신 콜백을 확인합니다.
- 페이지 모드는 `router.refresh()` 흐름을 확인합니다.
- 첨부, 체크리스트, 댓글, 하위 업무 변경 후 목록/상세가 함께 갱신되는지 확인합니다.

## 완료 업무 표시

- 메인 목록은 최근 완료 항목만 표시할 수 있습니다.
- 요약 카운트는 전체 완료를 포함할 수 있어 목록과 숫자가 달라 보일 수 있습니다. 이 차이는 의도인지 확인합니다.

## 알림과 활동 기록

- 알림 생성 실패가 업무 변경 자체를 막지 않도록 처리합니다.
- 활동 기록 Realtime은 중복 ID 체크를 유지합니다.
- 업무 목록 자체는 Realtime보다 캐시와 수동 갱신 흐름이 중심입니다.
- 업무 생성/완료 등은 **대시보드 최근 활동 피드(`activity_log`)에도 DB 트리거로 기록**됩니다. 트리거를 건드릴 일이 있으면 `supabase/migrations/117_activity_log.sql`과 `src/lib/activity/`를 함께 확인합니다.

## 프로젝트 연동

- 할일에는 `project_id`가 있고, 대시보드 오늘 할 일 카드에 프로젝트 배지가 표시됩니다(마이그 101·102).
- 할일을 업무 타임라인으로 공유하면 프로젝트가 함께 넘어갑니다.
- 프로젝트 필터는 `?project=` URL 규약을 씁니다. 관련 화면을 바꾸면 규약을 쓰는 다른 화면도 함께 확인합니다.

## 성능 주의

- 대시보드 업무 요약은 `tasks` 전체를 스캔하지 않도록 사전 필터와 부분 인덱스가 걸려 있습니다(마이그 088). 이 조건을 넓히면 대시보드가 다시 느려집니다.
- 초기 데이터를 바꿀 때는 빠른 경로(`src/lib/tasks/fast-queries.ts`)와 Supabase RPC 폴백을 **양쪽** 고치고 `npm run test:performance`로 확인합니다.
