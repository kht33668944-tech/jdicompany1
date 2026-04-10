# Task Detail Slide Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 할일 리스트에서 항목 클릭 시 페이지 이동 없이 오른쪽에서 슬라이드로 열리는 패널로 상세 정보를 표시한다.

**Architecture:** URL 쿼리 파라미터(`?detail=taskId`)로 패널 상태를 관리한다. 새 컴포넌트 `TaskDetailPanel`이 패널 껍데기(backdrop + slide + 데이터 fetch)를 담당하고, 기존 `TaskDetailClient`를 `mode` prop으로 page/panel 모드를 분기하여 재사용한다.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, Supabase Client, useSearchParams

---

### Task 1: TaskDetailPanel 컴포넌트 생성

패널의 껍데기 — backdrop, 슬라이드 애니메이션, 데이터 fetching, 로딩 UI를 담당.

**Files:**
- Create: `src/components/dashboard/tasks/TaskDetailPanel.tsx`

- [ ] **Step 1: TaskDetailPanel 컴포넌트 작성**

```tsx
// src/components/dashboard/tasks/TaskDetailPanel.tsx
"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getTaskBasic,
  getChecklistItems,
  getSubtasksBasic,
  getAttachments,
  getActivities,
} from "@/lib/tasks/queries";
import type { Profile } from "@/lib/attendance/types";
import type {
  TaskWithDetails,
  TaskChecklistItem,
  TaskAttachment,
  TaskActivity,
} from "@/lib/tasks/types";
import TaskDetailClient from "./detail/TaskDetailClient";

interface Props {
  profiles: Profile[];
  userId: string;
}

interface TaskDetailData {
  task: TaskWithDetails;
  checklist: TaskChecklistItem[];
  subtasks: TaskWithDetails[];
  attachments: TaskAttachment[];
  activities: TaskActivity[];
}

export default function TaskDetailPanel({ profiles, userId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("detail");

  const [data, setData] = useState<TaskDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [sliding, setSliding] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // taskId 변경 시 데이터 fetch
  useEffect(() => {
    if (!taskId) {
      // 닫기 애니메이션
      if (visible) {
        setSliding(false);
        const timer = setTimeout(() => setVisible(false), 200);
        return () => clearTimeout(timer);
      }
      return;
    }

    let cancelled = false;
    setVisible(true);
    setLoading(true);
    setError(null);

    // 약간의 지연 후 슬라이드 시작 (mount 직후 transition 적용을 위해)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setSliding(true);
      });
    });

    const supabase = createClient();

    Promise.all([
      getTaskBasic(supabase, taskId),
      getChecklistItems(supabase, taskId),
      getSubtasksBasic(supabase, taskId),
      getAttachments(supabase, taskId),
      getActivities(supabase, taskId),
    ])
      .then(([task, checklist, subtasks, attachments, activities]) => {
        if (cancelled) return;
        if (!task) {
          setError("할일을 찾을 수 없습니다.");
          setLoading(false);
          return;
        }
        task.checklist_total = checklist.length;
        task.checklist_completed = checklist.filter((c) => c.is_completed).length;
        task.subtask_count = subtasks.length;
        task.comment_count = activities.filter((a) => a.type === "comment").length;
        task.attachment_count = attachments.length;

        setData({ task, checklist, subtasks, attachments, activities });
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("데이터를 불러오는데 실패했습니다.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible]);

  // body scroll lock
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [visible]);

  const closePanel = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("detail");
    const qs = params.toString();
    router.push(`/dashboard/tasks${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, searchParams]);

  // 패널 내에서 다른 task로 이동 (하위 할일 등)
  const navigateToTask = useCallback(
    (newTaskId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("detail", newTaskId);
      router.push(`/dashboard/tasks?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleRefresh = useCallback(() => {
    if (!taskId) return;
    // 동일 taskId 로 데이터 재조회
    const supabase = createClient();
    Promise.all([
      getTaskBasic(supabase, taskId),
      getChecklistItems(supabase, taskId),
      getSubtasksBasic(supabase, taskId),
      getAttachments(supabase, taskId),
      getActivities(supabase, taskId),
    ]).then(([task, checklist, subtasks, attachments, activities]) => {
      if (!task) return;
      task.checklist_total = checklist.length;
      task.checklist_completed = checklist.filter((c) => c.is_completed).length;
      task.subtask_count = subtasks.length;
      task.comment_count = activities.filter((a) => a.type === "comment").length;
      task.attachment_count = attachments.length;
      setData({ task, checklist, subtasks, attachments, activities });
    });
  }, [taskId]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black transition-opacity duration-200 ${
          sliding ? "opacity-30" : "opacity-0"
        }`}
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`absolute top-0 right-0 h-full w-full sm:w-[55%] sm:min-w-[480px] bg-slate-50 shadow-2xl transform transition-transform duration-300 ease-out overflow-y-auto ${
          sliding ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-6 lg:p-8">
          {loading && (
            <div className="space-y-6 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-4 w-20 bg-slate-200 rounded" />
                <div className="h-8 w-16 bg-slate-200 rounded-xl" />
              </div>
              <div className="bg-white rounded-3xl p-6 space-y-4">
                <div className="h-6 w-3/4 bg-slate-200 rounded" />
                <div className="h-4 w-1/2 bg-slate-200 rounded" />
                <div className="h-20 w-full bg-slate-100 rounded-xl" />
              </div>
              <div className="bg-white rounded-3xl p-6 space-y-3">
                <div className="h-4 w-24 bg-slate-200 rounded" />
                <div className="h-8 w-full bg-slate-100 rounded-lg" />
                <div className="h-8 w-full bg-slate-100 rounded-lg" />
              </div>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <p className="text-sm text-red-500">{error}</p>
              <button
                onClick={closePanel}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white rounded-xl shadow-sm hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
          )}

          {!loading && !error && data && (
            <TaskDetailClient
              task={data.task}
              checklist={data.checklist}
              subtasks={data.subtasks}
              attachments={data.attachments}
              activities={data.activities}
              profiles={profiles}
              userId={userId}
              mode="panel"
              onClose={closePanel}
              onNavigate={navigateToTask}
              onRefresh={handleRefresh}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/dashboard/tasks/TaskDetailPanel.tsx
git commit -m "기능: TaskDetailPanel 슬라이드 패널 컴포넌트"
```

---

### Task 2: TaskDetailClient에 panel 모드 지원 추가

기존 `TaskDetailClient`에 `mode`, `onClose`, `onNavigate`, `onRefresh` props를 추가하여 패널 모드에서의 동작을 분기한다.

**Files:**
- Modify: `src/components/dashboard/tasks/detail/TaskDetailClient.tsx`

- [ ] **Step 1: Props 인터페이스 확장**

`Props` 인터페이스에 다음 optional props 추가:

```tsx
interface Props {
  task: TaskWithDetails;
  checklist: TaskChecklistItem[];
  subtasks: TaskWithDetails[];
  attachments: TaskAttachment[];
  activities: TaskActivity[];
  profiles: Profile[];
  userId: string;
  /** "page" (기본값) = 기존 전체 페이지, "panel" = 슬라이드 패널 */
  mode?: "page" | "panel";
  /** panel 모드 전용: 패널 닫기 */
  onClose?: () => void;
  /** panel 모드 전용: 패널 내 다른 task 로 이동 */
  onNavigate?: (taskId: string) => void;
  /** panel 모드 전용: 데이터 재조회 트리거 */
  onRefresh?: () => void;
}
```

- [ ] **Step 2: 컴포넌트 시그니처에 새 props 적용**

```tsx
export default function TaskDetailClient({
  task,
  checklist,
  subtasks,
  attachments,
  activities,
  profiles,
  userId,
  mode = "page",
  onClose,
  onNavigate,
  onRefresh,
}: Props) {
```

- [ ] **Step 3: 헤더 영역 — 뒤로가기/닫기 버튼 분기**

헤더의 뒤로가기 버튼 부분을 mode에 따라 분기:

```tsx
{/* 헤더 */}
<div className="flex items-center justify-between">
  {mode === "panel" ? (
    <button
      onClick={onClose}
      className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors text-sm font-medium"
    >
      <X size={18} />
      닫기
    </button>
  ) : (
    <button
      onClick={() => router.push("/dashboard/tasks")}
      className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors text-sm font-medium"
    >
      <ArrowLeft size={18} />
      뒤로 가기
    </button>
  )}
  {/* ... 저장/삭제 버튼은 기존과 동일 */}
</div>
```

`X` 아이콘을 import에 추가:

```tsx
import {
  ArrowLeft,
  Trash,
  XCircle,
  X,
} from "phosphor-react";
```

- [ ] **Step 4: handleSave에서 refresh 분기**

`handleSave` 함수에서 `router.refresh()` 대신 panel 모드일 때 `onRefresh` 호출:

```tsx
const handleSave = async () => {
  setSaving(true);
  setFeedback(null);
  try {
    await updateTask(task.id, userId, {
      title: title.trim(),
      description: description.trim() || null,
      status,
      priority,
      category: category || null,
      dueDate: dueDate || null,
      startDate: startDate || null,
    });
    setFeedback({ type: "success", message: "저장되었습니다." });
    if (mode === "panel" && onRefresh) {
      onRefresh();
    } else {
      router.refresh();
    }
  } catch (error) {
    setFeedback({ type: "error", message: getErrorMessage(error, "저장에 실패했습니다.") });
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 5: handleDelete에서 닫기 분기**

```tsx
const handleDelete = async () => {
  if (!confirm("정말 삭제하시겠습니까?")) return;
  setDeleting(true);
  try {
    await deleteTask(task.id);
    if (mode === "panel" && onClose) {
      onClose();
    } else {
      router.push("/dashboard/tasks");
      router.refresh();
    }
  } catch (error) {
    setFeedback({ type: "error", message: getErrorMessage(error, "삭제에 실패했습니다.") });
    setDeleting(false);
  }
};
```

- [ ] **Step 6: 담당자 추가/제거에서 refresh 분기**

```tsx
const handleAddAssignee = async (assigneeUserId: string) => {
  try {
    await addAssignee(task.id, assigneeUserId, userId);
    if (mode === "panel" && onRefresh) {
      onRefresh();
    } else {
      router.refresh();
    }
  } catch (error) {
    console.error("담당자 추가 실패:", error);
  }
};

const handleRemoveAssignee = async (assigneeUserId: string) => {
  try {
    await removeAssignee(task.id, assigneeUserId, userId);
    if (mode === "panel" && onRefresh) {
      onRefresh();
    } else {
      router.refresh();
    }
  } catch (error) {
    console.error("담당자 제거 실패:", error);
  }
};
```

- [ ] **Step 7: TaskSubtasks에 onNavigate/onRefresh 전달**

TaskSubtasks 렌더 부분에 새 props 전달:

```tsx
<TaskSubtasks
  taskId={task.id}
  subtasks={subtasks}
  userId={userId}
  profiles={profiles}
  canEdit={canEdit}
  mode={mode}
  onNavigate={onNavigate}
  onRefresh={onRefresh}
/>
```

- [ ] **Step 8: 커밋**

```bash
git add src/components/dashboard/tasks/detail/TaskDetailClient.tsx
git commit -m "기능: TaskDetailClient에 panel 모드 지원 추가"
```

---

### Task 3: TaskSubtasks에 panel 모드 지원 추가

하위 할일 클릭 시 패널 내에서 다른 task로 교체할 수 있도록 `mode`, `onNavigate`, `onRefresh` props 추가.

**Files:**
- Modify: `src/components/dashboard/tasks/detail/TaskSubtasks.tsx`

- [ ] **Step 1: Props 인터페이스 확장 및 클릭 핸들러 분기**

```tsx
interface Props {
  taskId: string;
  subtasks: TaskWithDetails[];
  userId: string;
  profiles: Profile[];
  canEdit: boolean;
  mode?: "page" | "panel";
  onNavigate?: (taskId: string) => void;
  onRefresh?: () => void;
}

export default function TaskSubtasks({
  taskId,
  subtasks,
  userId,
  profiles,
  canEdit,
  mode = "page",
  onNavigate,
  onRefresh,
}: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  const handleSubtaskClick = (subId: string) => {
    if (mode === "panel" && onNavigate) {
      onNavigate(subId);
    } else {
      router.push(`/dashboard/tasks/${subId}`);
    }
  };
```

- [ ] **Step 2: onClick 핸들러 교체**

기존 `onClick={() => router.push(...)}`를 `onClick={() => handleSubtaskClick(sub.id)}`로 교체:

```tsx
<div
  key={sub.id}
  onClick={() => handleSubtaskClick(sub.id)}
  className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-all"
>
```

- [ ] **Step 3: TaskCreateModal의 onClose에서 refresh 분기**

```tsx
{showCreate && (
  <TaskCreateModal
    userId={userId}
    profiles={profiles}
    onClose={() => {
      setShowCreate(false);
      if (mode === "panel" && onRefresh) {
        onRefresh();
      } else {
        router.refresh();
      }
    }}
    parentId={taskId}
  />
)}
```

- [ ] **Step 4: 커밋**

```bash
git add src/components/dashboard/tasks/detail/TaskSubtasks.tsx
git commit -m "기능: TaskSubtasks에 panel 모드 지원 추가"
```

---

### Task 4: TasksPageClient에서 패널 연동

`handleTaskClick`을 searchParams 기반으로 변경하고, `TaskDetailPanel`을 렌더링한다.

**Files:**
- Modify: `src/components/dashboard/tasks/TasksPageClient.tsx`

- [ ] **Step 1: import 추가 및 useSearchParams 사용**

```tsx
import { useRouter, useSearchParams } from "next/navigation";
import TaskDetailPanel from "./TaskDetailPanel";
```

- [ ] **Step 2: handleTaskClick 수정**

`router.push` 대신 searchParams에 `detail` 파라미터를 추가:

```tsx
const searchParams = useSearchParams();

const handleTaskClick = (taskId: string) => {
  const params = new URLSearchParams(searchParams.toString());
  params.set("detail", taskId);
  router.push(`/dashboard/tasks?${params.toString()}`, { scroll: false });
};
```

- [ ] **Step 3: TaskDetailPanel 렌더링 추가**

컴포넌트 return 문의 최하단, 닫는 `</div>` 직전에 추가:

```tsx
      {/* 생성 모달 */}
      {showCreate && (
        <TaskCreateModal
          userId={userId}
          profiles={profiles}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* 상세 패널 */}
      <TaskDetailPanel profiles={profiles} userId={userId} />
    </div>
  );
```

- [ ] **Step 4: 패널 닫힐 때 리스트 데이터 갱신**

패널에서 변경(저장/삭제)이 발생하면 리스트도 갱신되어야 한다.
`searchParams` 변화 감지로 패널이 닫힐 때(= detail이 사라질 때) 리스트를 refresh:

```tsx
// detail 파라미터 감시 — 패널이 닫힐 때 목록 갱신
const detailId = searchParams.get("detail");
const prevDetailRef = useRef<string | null>(null);

useEffect(() => {
  // 패널이 열린 상태에서 닫힌 경우에만 refresh
  if (prevDetailRef.current && !detailId) {
    void refreshTasks();
  }
  prevDetailRef.current = detailId;
}, [detailId, refreshTasks]);
```

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/tasks/TasksPageClient.tsx
git commit -m "기능: 할일 클릭 시 슬라이드 패널로 상세 표시"
```

---

### Task 5: 빌드 검증 및 최종 확인

**Files:**
- 변경 없음 (검증만)

- [ ] **Step 1: TypeScript 빌드 확인**

```bash
npm run build
```

기대: 빌드 성공, 타입 에러 없음.

- [ ] **Step 2: 에러가 있다면 수정**

빌드 에러가 있으면 해당 파일을 수정하고 다시 빌드 확인.

- [ ] **Step 3: 최종 커밋 (필요 시)**

빌드 수정이 있었다면:

```bash
git add -A
git commit -m "수정: 슬라이드 패널 빌드 에러 수정"
```
