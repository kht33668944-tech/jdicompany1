# 할일(Tasks) 기능 설계

## 개요

JDICOMPANY 내부 포털의 할일 관리 기능. 10인 이하 소규모 팀이 칸반 보드로 업무를 관리하고 추적할 수 있는 시스템.

**범위**: 칸반 보드 + 개인 할일 + 팀 보드 + 댓글 + 드래그&드롭
**대상**: 전 직원 (4~10명)
**DB**: Supabase (기존 profiles 테이블 활용)

---

## DB Schema

### tasks

```sql
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT '대기' CHECK (status IN ('대기', '진행중', '완료')),
  priority TEXT NOT NULL DEFAULT '보통' CHECK (priority IN ('긴급', '높음', '보통', '낮음')),
  category TEXT,
  due_date DATE,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_assigned ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_created_by ON public.tasks(created_by);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view all tasks" ON public.tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Creator and assignee can update" ON public.tasks FOR UPDATE TO authenticated USING (created_by = auth.uid() OR assigned_to = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Creator and admin can delete" ON public.tasks FOR DELETE TO authenticated USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
```

### task_comments

```sql
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_task ON public.task_comments(task_id, created_at);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view comments" ON public.task_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create own comments" ON public.task_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own comments" ON public.task_comments FOR DELETE TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
```

---

## 페이지 구조

```
/dashboard/tasks
├── 탭 1: 보드 (칸반) - 전체 팀의 할일
└── 탭 2: 내 할일 - 나에게 배정된 것만
```

### 칸반 보드 탭

3개 칼럼: **대기** / **진행중** / **완료**

- 각 칼럼에 해당 상태의 카드가 position 순으로 정렬
- **드래그&드롭**: 카드를 다른 칼럼으로 드래그하면 상태 변경 + position 업데이트
- 상단: 필터 바 (담당자, 카테고리, 우선순위) + "할일 추가" 버튼
- 라이브러리: `@hello-pangea/dnd` (react-beautiful-dnd의 유지보수 포크, React 19 호환)

### 칸반 카드 (TaskCard)

표시 정보:
- 제목 (1줄, 말줄임)
- 우선순위 뱃지: 긴급=빨강, 높음=주황, 보통=파랑, 낮음=회색
- 카테고리 태그 (있을 때만)
- 마감일: 지난 경우 빨간색, 오늘이면 주황색
- 담당자 아바타 (이니셜 원)
- 클릭 시 → TaskDetailModal 열림

### 내 할일 탭

- `assigned_to = 현재 유저` 필터
- 상태별 섹션 (대기 / 진행중 / 완료)
- 각 항목: 체크박스(완료 토글) + 제목 + 우선순위 + 마감일
- 클릭 시 → TaskDetailModal 열림

### TaskCreateModal

- 제목 (필수), 설명, 상태, 우선순위, 카테고리(select or 직접입력), 마감일, 담당자(profiles select)
- glass-card + glass-input 스타일

### TaskDetailModal

- 모든 필드 수정 가능
- 댓글 섹션: 댓글 목록(시간순) + 입력창
- 삭제 버튼 (생성자/admin만 표시)

---

## 파일 구조

```
src/
├── lib/tasks/
│   ├── types.ts              # Task, TaskComment, TaskStatus, Priority 등
│   ├── constants.ts          # STATUS_CONFIG, PRIORITY_CONFIG, CATEGORIES
│   ├── queries.ts            # getAllTasks, getMyTasks, getTaskComments 등
│   └── actions.ts            # createTask, updateTask, deleteTask, moveTask, addComment 등
├── app/dashboard/tasks/
│   └── page.tsx              # Server component: fetch tasks + profiles
└── components/dashboard/tasks/
    ├── TasksPageClient.tsx   # 탭 컨테이너
    ├── TaskBoard.tsx         # 칸반 보드 (DragDropContext 포함)
    ├── TaskColumn.tsx        # 개별 칼럼 (Droppable)
    ├── TaskCard.tsx          # 칸반 카드 (Draggable)
    ├── TaskDetailModal.tsx   # 상세/수정 모달
    ├── TaskCreateModal.tsx   # 생성 모달
    ├── TaskFilters.tsx       # 필터 바
    ├── TaskComments.tsx      # 댓글 목록 + 입력
    ├── MyTasksList.tsx       # 내 할일 리스트
    └── tabs/
        ├── BoardTab.tsx      # 보드 탭
        └── MyTasksTab.tsx    # 내 할일 탭
```

---

## 상수 정의

```typescript
// constants.ts
export const TASK_STATUS_CONFIG = {
  "대기": { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400", label: "대기" },
  "진행중": { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500", label: "진행중" },
  "완료": { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500", label: "완료" },
} as const;

export const PRIORITY_CONFIG = {
  "긴급": { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500" },
  "높음": { bg: "bg-orange-50", text: "text-orange-600", dot: "bg-orange-500" },
  "보통": { bg: "bg-brand-50", text: "text-brand-600", dot: "bg-brand-500" },
  "낮음": { bg: "bg-slate-50", text: "text-slate-500", dot: "bg-slate-400" },
} as const;

export const CATEGORIES = ["상품", "CS", "마케팅", "운영", "개발", "기타"] as const;

export type TaskTabId = "board" | "my-tasks";
export type TaskStatus = "대기" | "진행중" | "완료";
export type TaskPriority = "긴급" | "높음" | "보통" | "낮음";
```

---

## 데이터 흐름

```
page.tsx (Server)
  ├── getAllTasks(supabase) → Task[] (profiles join 포함)
  ├── getAllProfiles(supabase) → Profile[] (담당자 선택용)
  └── props → TasksPageClient

TasksPageClient (Client)
  ├── 탭 상태 관리
  ├── BoardTab → TaskBoard → TaskColumn[] → TaskCard[]
  └── MyTasksTab → MyTasksList

Mutation:
  1. 유저 액션 (생성, 수정, 드래그&드롭)
  2. actions.ts 호출 (브라우저 Supabase 클라이언트)
  3. 낙관적 로컬 상태 업데이트
  4. router.refresh()
```

---

## 드래그&드롭 구현

- 라이브러리: `@hello-pangea/dnd`
- `DragDropContext` → `TaskBoard` 레벨
- 각 칼럼 = `Droppable` (droppableId = status)
- 각 카드 = `Draggable` (draggableId = task.id)
- `onDragEnd`: 같은 칼럼 내 이동 → position 업데이트, 다른 칼럼 → status + position 업데이트
- `moveTask(taskId, newStatus, newPosition)` action 호출
- 낙관적 업데이트: 로컬 상태 즉시 반영 후 DB 동기화

---

## 새 npm 패키지

- `@hello-pangea/dnd` - 드래그&드롭 (react-beautiful-dnd 포크, React 19 호환)

---

## 대시보드 위젯 연동

기존 `TasksWidget.tsx`를 Supabase 연동으로 업데이트:
- `dashboard/page.tsx`에서 나에게 배정된 최근 할일 4개 fetch
- 위젯에서 실시간 데이터 표시
- "전체 보기" → `/dashboard/tasks`
