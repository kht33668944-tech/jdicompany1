# 할일(Tasks) 탭 리디자인 설계

## 개요

기존 단순 칸반 보드 + 내 할일 2탭 구조를 Linear + Notion 하이브리드 스타일로 전면 리디자인.
리스트 중심의 빠른 조작 + 서브태스크/진행률/첨부파일/활동 타임라인으로 스타트업 협업 도구 수준의 업무 관리 시스템 구축.

**대상**: 전 직원 (4~10명)
**DB**: Supabase (기존 tasks 테이블 확장 + 신규 테이블 추가)
**파일 저장**: Supabase Storage (신규 `task-attachments` 버킷)

---

## 핵심 변경 사항 (기존 대비)

| 항목 | 기존 | 리디자인 |
|------|------|----------|
| 뷰 | 칸반 보드 + 내 할일 (2탭) | 리스트 + 보드 + 캘린더 + 타임라인 (4뷰 전환) |
| 상세 화면 | 모달 | 전체 페이지 (`/dashboard/tasks/[id]`) |
| 서브태스크 | 없음 | 체크리스트 + 독립 서브태스크 |
| 파일 첨부 | 없음 | 이미지/파일 업로드, 미리보기 |
| 소통 | 단순 댓글 | 댓글 + 활동 이력 통합 타임라인 |
| 관리자 | 필터만 | 상단 요약 패널 (통계 카드) |
| 진행률 | 없음 | 서브태스크 기반 자동 계산 |
| 담당자 | 1명 | 다수 담당자 지원 |

---

## DB Schema 변경

### tasks 테이블 확장

기존 컬럼 유지 + 아래 컬럼 추가:

```sql
-- 기존 assigned_to (단일) → task_assignees 테이블로 다수 담당자 이동
-- assigned_to 컬럼은 하위 호환을 위해 유지하되, 새 로직은 task_assignees 사용

ALTER TABLE public.tasks
  ADD COLUMN parent_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  ADD COLUMN start_date DATE;

CREATE INDEX idx_tasks_parent ON public.tasks(parent_id);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
```

- `parent_id`: 독립 서브태스크용. NULL이면 최상위 할일, 값이 있으면 서브태스크.
- `start_date`: 타임라인(간트) 뷰용 시작일.

### task_assignees (신규)

```sql
CREATE TABLE public.task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, user_id)
);

CREATE INDEX idx_task_assignees_task ON public.task_assignees(task_id);
CREATE INDEX idx_task_assignees_user ON public.task_assignees(user_id);

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view" ON public.task_assignees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Task creator/admin can manage assignees" ON public.task_assignees FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Task creator/admin can remove assignees" ON public.task_assignees FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
```

### task_checklist_items (신규)

```sql
CREATE TABLE public.task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checklist_task ON public.task_checklist_items(task_id, position);

ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view" ON public.task_checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Task participants can manage" ON public.task_checklist_items FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks WHERE id = task_id AND (created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.task_assignees WHERE task_id = task_checklist_items.task_id AND user_id = auth.uid())))
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
```

### task_attachments (신규)

```sql
CREATE TABLE public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_task ON public.task_attachments(task_id);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view" ON public.task_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can upload" ON public.task_attachments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Uploader/admin can delete" ON public.task_attachments FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
```

### task_activities (신규)

댓글 + 활동 이력 통합 타임라인.

```sql
CREATE TABLE public.task_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('comment', 'status_change', 'assignee_change', 'priority_change', 'attachment', 'checklist', 'edit')),
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_task ON public.task_activities(task_id, created_at);

ALTER TABLE public.task_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view" ON public.task_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create" ON public.task_activities FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Creator/admin can delete" ON public.task_activities FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
```

`metadata` 예시:
- status_change: `{"from": "대기", "to": "진행중"}`
- assignee_change: `{"added": ["user_id"], "removed": ["user_id"]}`
- attachment: `{"file_name": "design.png", "attachment_id": "uuid"}`
- checklist: `{"action": "completed", "item": "디자인 확정"}`

### Supabase Storage

```
버킷: task-attachments (public read, authenticated upload)
경로: {task_id}/{uuid}.{ext}
```

---

## 페이지 구조

```
/dashboard/tasks                 # 할일 목록 (4뷰 전환)
/dashboard/tasks/[id]            # 할일 상세 (전체 페이지)
```

---

## 뷰 전환 (4종)

### 공통 상단 영역

```
┌─────────────────────────────────────────────────────────────┐
│ [요약 패널] 전체 24 | 진행중 8 | 지연 2 🔴 | 이번 주 완료 5 │
├─────────────────────────────────────────────────────────────┤
│ [📋 리스트] [📊 보드] [📅 캘린더] [⏱ 타임라인]  | 필터 | + 할일 추가 │
├─────────────────────────────────────────────────────────────┤
│ 필터 바: 담당자, 카테고리, 우선순위, 상태 | 그룹핑 | 정렬     │
└─────────────────────────────────────────────────────────────┘
```

- 요약 패널: 관리자/일반 모두 볼 수 있되, 관리자는 "팀원별" 드롭다운 추가
- 뷰 전환: localStorage에 마지막 선택 뷰 저장
- 필터: URL 파라미터로 관리 (공유 가능)

### 1. 리스트 뷰 (메인)

Linear 스타일 테이블. 그룹핑 기본값 = 상태별.

각 행 표시:
- 상태 아이콘 (●/○/✓)
- 제목 (서브태스크 있으면 인덴트)
- 우선순위 뱃지
- 카테고리 태그
- 담당자 아바타(들)
- 마감일 (지연 시 빨간색)
- 서브태스크 진행률 (3/5)
- 댓글 수 아이콘

그룹핑 옵션: 상태별, 담당자별, 카테고리별, 우선순위별
정렬 옵션: 마감일, 우선순위, 생성일, 최근 업데이트

### 2. 보드 뷰

기존 칸반 유지하되 개선:
- 3열: 대기 / 진행중 / 완료
- 카드에 서브태스크 진행률 바, 담당자(복수) 아바타, 첨부파일 수 표시
- 드래그&드롭 유지 (`@hello-pangea/dnd`)

### 3. 캘린더 뷰

월간 캘린더. 마감일 기준으로 할일 배치.

- 각 날짜 셀에 해당일 마감 할일 표시 (우선순위 색상 점)
- 할일 클릭 시 상세 페이지 이동
- 오늘 하이라이트
- 월 이동 네비게이션

### 4. 타임라인(간트) 뷰

수평 바 차트. start_date ~ due_date 구간 표시.

- 왼쪽: 할일 목록 (제목, 담당자)
- 오른쪽: 날짜 축에 바 표시
- 바 색상 = 상태 (대기=회색, 진행중=주황, 완료=초록)
- start_date 없는 할일은 created_at 사용
- 주/월 스케일 전환

---

## 할일 상세 페이지 (`/dashboard/tasks/[id]`)

전체 페이지 레이아웃:

```
┌─────────────────────────────────────────────────────────────┐
│ ← 뒤로 가기                                    [삭제] [편집] │
├──────────────────────────────┬──────────────────────────────┤
│                              │ 사이드바                      │
│ 제목 (인라인 편집)            │ ─────────────                │
│                              │ 상태: [대기 ▾]               │
│ 설명 (인라인 편집)            │ 우선순위: [보통 ▾]           │
│                              │ 담당자: 김효태, +추가         │
│ ── 체크리스트 ──              │ 카테고리: [개발 ▾]           │
│ ✅ 디자인 확정                │ 시작일: 4/1                  │
│ ✅ API 연동                   │ 마감일: 4/8                  │
│ ⬜ QA 테스트                  │ 생성자: 박민수               │
│ + 항목 추가                   │ 생성일: 3/28                 │
│                              │                              │
│ ── 서브태스크 ──              │ ── 첨부파일 ──               │
│ ● 랜딩 디자인 (진행중, 김효태)│ 📎 design-v2.png            │
│ ○ QA 테스트 (대기, 이지은)    │ 📎 요구사항.pdf             │
│ + 서브태스크 추가             │ + 파일 추가                  │
│                              │                              │
├──────────────────────────────┴──────────────────────────────┤
│ ── 활동 타임라인 ──                                          │
│                                                             │
│ 김효태 · 방금 전                                             │
│ 상태를 "대기" → "진행중"으로 변경                              │
│                                                             │
│ 이지은 · 2시간 전                                            │
│ 디자인 시안 첨부합니다 📎 landing-v2.png                      │
│                                                             │
│ 박민수 · 어제                                                │
│ 담당자에 이지은을 추가                                        │
│                                                             │
│ [댓글 입력창 + 파일 첨부 버튼]                                │
└─────────────────────────────────────────────────────────────┘
```

### 권한

| 동작 | 생성자 | 담당자 | 관리자 | 기타 |
|------|--------|--------|--------|------|
| 보기 | ✅ | ✅ | ✅ | ✅ |
| 편집 | ✅ | ✅ | ✅ | ❌ |
| 삭제 | ✅ | ❌ | ✅ | ❌ |
| 댓글/첨부 | ✅ | ✅ | ✅ | ✅ |

---

## 파일 구조 (리디자인)

```
src/
├── lib/tasks/
│   ├── types.ts              # 확장된 타입 정의
│   ├── constants.ts          # 상수 (기존 유지)
│   ├── queries.ts            # 쿼리 확장 (서브태스크, 첨부파일, 활동 포함)
│   ├── actions.ts            # 액션 확장 (첨부파일, 체크리스트, 활동 기록)
│   └── utils.ts              # 진행률 계산, 날짜 유틸 등
├── app/dashboard/tasks/
│   ├── page.tsx              # 목록 페이지 (Server Component)
│   └── [id]/
│       └── page.tsx          # 상세 페이지 (Server Component)
└── components/dashboard/tasks/
    ├── TasksPageClient.tsx   # 메인 클라이언트 (뷰 전환 + 요약 패널)
    ├── TaskSummaryPanel.tsx  # 상단 요약 통계
    ├── TaskFilters.tsx       # 필터/그룹핑/정렬 바
    ├── TaskCreateModal.tsx   # 생성 모달 (확장)
    ├── views/
    │   ├── ListView.tsx      # 리스트 뷰
    │   ├── ListRow.tsx       # 리스트 행
    │   ├── BoardView.tsx     # 보드(칸반) 뷰
    │   ├── BoardColumn.tsx   # 보드 칼럼
    │   ├── BoardCard.tsx     # 보드 카드
    │   ├── CalendarView.tsx  # 캘린더 뷰
    │   └── TimelineView.tsx  # 타임라인(간트) 뷰
    └── detail/
        ├── TaskDetailClient.tsx    # 상세 페이지 클라이언트
        ├── TaskHeader.tsx          # 제목 + 뒤로가기 + 액션 버튼
        ├── TaskDescription.tsx     # 설명 인라인 편집
        ├── TaskSidebar.tsx         # 속성 사이드바
        ├── TaskChecklist.tsx       # 체크리스트
        ├── TaskSubtasks.tsx        # 독립 서브태스크 목록
        ├── TaskAttachments.tsx     # 첨부파일 (사이드바용)
        ├── TaskActivityTimeline.tsx # 활동 타임라인
        └── TaskCommentInput.tsx    # 댓글 + 파일 첨부 입력
```

---

## 타입 정의 (확장)

```typescript
export type TaskStatus = "대기" | "진행중" | "완료";
export type TaskPriority = "긴급" | "높음" | "보통" | "낮음";
export type TaskViewId = "list" | "board" | "calendar" | "timeline";
export type TaskGroupBy = "status" | "assignee" | "category" | "priority";
export type TaskSortBy = "due_date" | "priority" | "created_at" | "updated_at";
export type ActivityType = "comment" | "status_change" | "assignee_change" | "priority_change" | "attachment" | "checklist" | "edit";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category: string | null;
  due_date: string | null;
  start_date: string | null;
  position: number;
  parent_id: string | null;
  created_by: string;
  assigned_to: string | null; // 하위호환, 새 로직은 task_assignees
  created_at: string;
  updated_at: string;
}

export interface TaskWithDetails extends Task {
  creator_profile: { full_name: string; avatar_url: string | null };
  assignees: { user_id: string; full_name: string; avatar_url: string | null }[];
  checklist_total: number;
  checklist_completed: number;
  subtask_count: number;
  comment_count: number;
  attachment_count: number;
}

export interface TaskChecklistItem {
  id: string;
  task_id: string;
  content: string;
  is_completed: boolean;
  position: number;
  created_at: string;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  uploader_profile: { full_name: string };
}

export interface TaskActivity {
  id: string;
  task_id: string;
  user_id: string;
  type: ActivityType;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user_profile: { full_name: string; avatar_url: string | null };
}

export interface TaskSummary {
  total: number;
  by_status: Record<TaskStatus, number>;
  overdue: number;
  completed_this_week: number;
}
```

---

## 데이터 흐름

```
목록 페이지 (Server Component)
  ├── getTasksWithDetails() → TaskWithDetails[] (assignees, 진행률 등 join)
  ├── getTaskSummary() → TaskSummary
  ├── getAllProfiles() → Profile[]
  └── props → TasksPageClient → 뷰 컴포넌트

상세 페이지 (Server Component)
  ├── getTaskById(id) → TaskWithDetails
  ├── getChecklistItems(id) → TaskChecklistItem[]
  ├── getSubtasks(id) → TaskWithDetails[]
  ├── getAttachments(id) → TaskAttachment[]
  ├── getActivities(id) → TaskActivity[]
  └── props → TaskDetailClient

Mutation:
  1. 유저 액션 (편집, 상태 변경, 댓글, 첨부 등)
  2. actions.ts 호출
  3. DB 업데이트 + task_activities 자동 기록
  4. 낙관적 로컬 상태 업데이트
  5. router.refresh()
```

---

## 새 npm 패키지

- `@hello-pangea/dnd` — 보드 뷰 드래그&드롭 (기존 유지)
- 타임라인/캘린더는 직접 구현 (외부 라이브러리 의존 최소화)

---

## 마이그레이션 전략

1. 기존 `task_comments` 데이터 → `task_activities` (type='comment')로 마이그레이션. 마이그레이션 완료 후 `task_comments` 테이블 DROP.
2. 기존 `assigned_to` 데이터 → `task_assignees`로 마이그레이션. 마이그레이션 완료 후 `assigned_to` 컬럼 DROP.
3. 기존 컴포넌트 전체 교체 (점진적 마이그레이션 아닌 일괄 교체)
4. 기존 007_tasks.sql 이후 신규 마이그레이션 파일 추가 (016번대)

---

## 워크플로우

1. **플랜 모드**: 구체적 구현 계획 작성
2. **UI 제작**: 사용자가 직접 UI 컴포넌트 제작
3. **기능 구현**: UI 전달 받은 후 데이터/로직 구현
