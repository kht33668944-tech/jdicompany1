# Task Detail Slide Panel — 설계 문서

## 개요

할일 리스트에서 항목 클릭 시 페이지 이동 없이 오른쪽에서 슬라이드로 열리는 패널로 상세 정보를 표시한다. 기존 상세 페이지(`/tasks/[id]`) UI를 재사용하여 중복 구현을 방지한다.

## 결정사항

| 항목 | 결정 |
|---|---|
| URL 처리 | `?detail=123` 쿼리 파라미터 — 새로고침/뒤로가기 지원 |
| 데스크톱 레이아웃 | 반투명 backdrop + 오른쪽 55% 슬라이드 패널 |
| 모바일 레이아웃 | 풀스크린 패널 (100% 너비) |
| 닫기 방법 | backdrop 클릭 / ESC 키 / X 버튼 / 브라우저 뒤로가기 |
| 하위 할일 클릭 | 같은 패널에서 교체 + 히스토리 push로 뒤로가기 지원 |
| 기존 상세 페이지 | 유지 — URL 직접 접근 시 전체 페이지로 표시 |

## 컴포넌트 구조

```
TasksPageClient.tsx (기존)
├── ListView / CalendarView / TimelineView (기존)
└── TaskDetailPanel.tsx (신규)
    ├── backdrop (반투명 오버레이)
    ├── slide container (CSS transition 애니메이션)
    └── TaskDetailClient.tsx (기존 재사용)
```

## 파일 변경 계획

### 신규: `src/components/dashboard/tasks/TaskDetailPanel.tsx`

패널의 껍데기 컴포넌트. 담당:
- `searchParams`에서 `detail` 파라미터 읽어서 taskId 결정
- taskId가 있으면 패널 표시, 없으면 미표시
- backdrop 렌더링 (클릭 시 닫기)
- 슬라이드 애니메이션 (CSS transition: transform translateX)
- ESC 키 이벤트 핸들링
- 클라이언트에서 task 상세 데이터 fetch (서버 컴포넌트가 아닌 클라이언트 fetch)
- 데이터 로딩 중 스켈레톤 UI 표시
- 데스크톱: 55% 너비, 모바일: 100% 너비 (Tailwind 반응형)

### 수정: `TasksPageClient.tsx`

- `handleTaskClick(taskId)`: `router.push('/dashboard/tasks/' + taskId)` → `searchParams`에 `detail=taskId` 추가로 변경
- `TaskDetailPanel` 컴포넌트를 하단에 렌더링
- 패널 닫기 시 `detail` 파라미터 제거

### 수정: `TaskDetailClient.tsx`

- `mode` prop 추가: `"page" | "panel"` (기본값 `"page"`)
- panel 모드일 때:
  - 뒤로가기 버튼 → `detail` 파라미터 제거 (페이지 이동 대신)
  - 상단에 X(닫기) 버튼 표시
  - 삭제 후 패널 닫기 (페이지 이동 대신)
- page 모드: 기존 동작 그대로 유지

### 수정: `TaskSubtasks.tsx`

- panel 모드일 때: 하위 할일 클릭 → `router.push('/dashboard/tasks/' + sub.id)` 대신 `detail` 파라미터를 자식 id로 교체
- `router.push`를 사용하여 히스토리 스택에 추가 (뒤로가기 지원)

## 데이터 흐름

```
할일 클릭
  → URL에 ?detail=taskId 추가 (searchParams)
  → TaskDetailPanel 마운트
  → 클라이언트에서 task 상세 데이터 fetch (task, checklist, subtasks, attachments, activities, profiles)
  → TaskDetailClient 렌더링

닫기
  → URL에서 ?detail 제거
  → slide-out 애니메이션 (300ms)
  → 언마운트

하위 할일 클릭
  → ?detail=parentId → ?detail=childId (router.push)
  → 패널 내용 교체 (새 데이터 fetch)
  → 브라우저 뒤로가기 시 부모로 복귀
```

## 데이터 fetch 전략

기존 상세 페이지(`[id]/page.tsx`)는 서버 컴포넌트에서 병렬 fetch 후 클라이언트에 전달하는 구조. 패널은 클라이언트에서 동적으로 열리므로 클라이언트 fetch가 필요하다.

- `TaskDetailPanel`에서 taskId 변경 시 Supabase 클라이언트로 직접 fetch
- 기존 `queries.ts`의 쿼리 함수를 재사용 (서버 전용이 아닌 것들)
- 서버 전용 쿼리(`queries.server.ts`)는 사용 불가 → 클라이언트용 fetch 함수 필요 시 `queries.ts`에 추가

## 애니메이션

- **열기**: `translateX(100%)` → `translateX(0)`, 300ms ease-out
- **닫기**: `translateX(0)` → `translateX(100%)`, 200ms ease-in
- **backdrop**: opacity 0 → 0.5, 동시 전환
- body scroll lock: 패널 열릴 때 `overflow: hidden` 적용

## 접근성

- ESC 키로 닫기
- 패널 열릴 때 포커스 트랩 (패널 내부로 포커스 이동)
- backdrop에 `aria-hidden="true"`
- 패널에 `role="dialog"`, `aria-modal="true"`
