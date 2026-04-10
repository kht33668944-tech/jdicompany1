# 사이드 패널 간소화 + 기간 컬럼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사이드 패널을 업무 집중 모드(단일 컬럼, 체크리스트+활동 로그)로 재구성하고, 리스트 뷰의 마감일 컬럼을 시작일~마감일 통합 "기간" 컬럼으로 변경한다.

**Architecture:** TaskDetailClient에 `mode === "panel"` 조건부 렌더링을 추가하여 단일 컬럼 레이아웃을 구현한다. TaskCommentInput에 드래그앤드롭/붙여넣기 파일 첨부를 추가하고, ListRow의 마감일 컬럼을 기간(시작일~마감일) 드롭다운으로 교체한다.

**Tech Stack:** React, Tailwind CSS, Supabase Storage, Next.js App Router

---

### Task 1: TaskDetailClient 패널 모드 단일 컬럼 레이아웃

패널 모드일 때 속성 사이드바, 서브태스크, 첨부파일 섹션을 숨기고 단일 컬럼으로 렌더링한다.

**Files:**
- Modify: `src/components/dashboard/tasks/detail/TaskDetailClient.tsx`

- [ ] **Step 1: 본문+사이드바 영역을 mode 분기**

현재 코드 (약 232행):
```tsx
{/* 본문 + 사이드바 */}
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
  {/* 좌측: 본문 */}
  <div className="lg:col-span-2 space-y-6">
```

mode === "panel" 일 때 grid를 단일 컬럼으로 변경하고, 서브태스크/첨부파일/속성 사이드바를 숨긴다:

```tsx
{/* 본문 + 사이드바 */}
<div className={mode === "panel" ? "space-y-6" : "grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6"}>
  {/* 좌측: 본문 */}
  <div className={mode === "panel" ? "space-y-6" : "lg:col-span-2 space-y-6"}>
```

- [ ] **Step 2: 서브태스크 섹션을 page 모드에서만 표시**

TaskSubtasks 렌더링 부분을 조건부로 감싼다:

```tsx
{/* 서브태스크 — page 모드에서만 */}
{mode !== "panel" && (
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
)}
```

- [ ] **Step 3: 사이드바 전체를 page 모드에서만 표시**

속성 + 첨부파일이 있는 사이드바 div를 조건부로 감싼다:

```tsx
{/* 우측: 사이드바 — page 모드에서만 */}
{mode !== "panel" && (
  <div className="space-y-6">
    {/* 속성 */}
    <div className="bg-white rounded-3xl shadow-sm p-6 space-y-4">
      ...기존 속성 코드...
    </div>

    {/* 첨부파일 */}
    <TaskAttachments ... />
  </div>
)}
```

- [ ] **Step 4: 패널 모드 댓글 입력에 mode prop 전달**

TaskCommentInput에 mode와 onRefresh를 전달 (Task 3에서 확장 예정):

```tsx
<TaskCommentInput
  taskId={task.id}
  userId={userId}
  mode={mode}
  onRefresh={onRefresh}
/>
```

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/tasks/detail/TaskDetailClient.tsx
git commit -m "UI: 패널 모드 단일 컬럼 레이아웃 (속성/서브태스크/첨부 숨김)"
```

---

### Task 2: 리스트 뷰 기간 컬럼

마감일 컬럼을 시작일~마감일 통합 "기간" 컬럼으로 변경한다.

**Files:**
- Modify: `src/components/dashboard/tasks/views/ListRow.tsx`
- Modify: `src/components/dashboard/tasks/views/ListView.tsx`

- [ ] **Step 1: EditingField 타입에 period 추가**

```tsx
type EditingField = "priority" | "category" | "assignee" | "period" | null;
```

기존 `"dueDate"` 를 `"period"` 로 변경한다.

- [ ] **Step 2: handleDueDateChange를 handlePeriodChange로 교체**

기존 `handleDueDateChange`를 제거하고 시작일+마감일 동시 처리 함수로 교체:

```tsx
const handleStartDateChange = async (startDate: string | null) => {
  try {
    await updateTask(task.id, userId, { startDate });
    router.refresh();
  } catch (error) {
    console.error("시작일 변경 실패:", error);
  }
};

const handleDueDateChange = async (dueDate: string | null) => {
  try {
    await updateTask(task.id, userId, { dueDate });
    router.refresh();
  } catch (error) {
    console.error("마감일 변경 실패:", error);
  }
};
```

- [ ] **Step 3: 기간 표시 포맷 함수 추가**

ListRow 파일 상단(컴포넌트 바깥)에 추가:

```tsx
function formatPeriod(startDate: string | null | undefined, dueDate: string | null | undefined): string {
  const fmt = (d: string) => {
    const [, m, day] = d.split("-");
    return `${m}.${day}`;
  };
  if (startDate && dueDate) return `${fmt(startDate)} ~ ${fmt(dueDate)}`;
  if (startDate) return `${fmt(startDate)} ~`;
  if (dueDate) return `~ ${fmt(dueDate)}`;
  return "—";
}
```

- [ ] **Step 4: 마감일 컬럼 td를 기간 드롭다운으로 교체**

기존 마감일 td (314행~335행) 전체를 교체:

```tsx
{/* 기간 — 인라인 수정 */}
<td className="px-4 py-3 relative">
  {editingField === "period" ? (
    <div ref={dropdownRef} onClick={(e) => e.stopPropagation()} className="absolute top-full right-0 mt-1 z-30 bg-white rounded-xl shadow-lg border border-slate-100 p-3 min-w-[220px]">
      <div className="space-y-2">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">시작일</label>
          <input
            type="date"
            defaultValue={task.start_date ?? ""}
            onChange={(e) => handleStartDateChange(e.target.value || null)}
            className="glass-input px-2 py-1 rounded-lg text-sm outline-none w-full"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">마감일</label>
          <input
            type="date"
            defaultValue={task.due_date ?? ""}
            onChange={(e) => handleDueDateChange(e.target.value || null)}
            className="glass-input px-2 py-1 rounded-lg text-sm outline-none w-full"
          />
        </div>
      </div>
    </div>
  ) : null}
  <span
    onClick={openField("period")}
    className={`text-sm ${dueInfo.className} cursor-pointer hover:underline transition-colors`}
    title="클릭하여 수정"
  >
    {formatPeriod(task.start_date, task.due_date)}
  </span>
</td>
```

주의: 드롭다운이 열려도 기간 텍스트는 항상 표시. 드롭다운은 텍스트 위(absolute)에 떠서 표시.

- [ ] **Step 5: ListView.tsx 테이블 헤더 변경**

`src/components/dashboard/tasks/views/ListView.tsx` 에서:

```tsx
<th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase w-28">마감일</th>
```

를 다음으로 변경:

```tsx
<th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase w-36">기간</th>
```

- [ ] **Step 6: 커밋**

```bash
git add src/components/dashboard/tasks/views/ListRow.tsx src/components/dashboard/tasks/views/ListView.tsx
git commit -m "UI: 리스트 뷰 마감일 → 기간 컬럼 (시작일+마감일 통합)"
```

---

### Task 3: TaskCommentInput 파일 첨부 지원

댓글 입력에 드래그앤드롭 + Ctrl+V 파일 첨부 기능을 추가한다.

**Files:**
- Modify: `src/components/dashboard/tasks/detail/TaskCommentInput.tsx`
- Modify: `src/lib/tasks/actions.ts` (addComment에 metadata 지원 추가)

- [ ] **Step 1: addComment에 metadata 매개변수 추가**

`src/lib/tasks/actions.ts` 의 `addComment` 함수 시그니처를 확장:

```tsx
export async function addComment(
  taskId: string,
  userId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<TaskActivity> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("task_activities")
    .insert({
      task_id: taskId,
      user_id: userId,
      type: "comment",
      content,
      ...(metadata ? { metadata } : {}),
    })
    .select("*, user_profile:profiles!task_activities_user_id_fkey(full_name, avatar_url)")
    .single();
```

기존 호출부는 metadata를 전달하지 않으므로 영향 없음.

- [ ] **Step 2: TaskCommentInput Props 확장 및 상태 추가**

```tsx
interface Props {
  taskId: string;
  userId: string;
  mode?: "page" | "panel";
  onRefresh?: () => void;
}

export default function TaskCommentInput({ taskId, userId, mode = "page", onRefresh }: Props) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
```

import에 `useRef` 추가, `Paperclip`, `X` 아이콘 추가:

```tsx
import { useState, useRef } from "react";
import { PaperPlaneRight, Paperclip, X } from "phosphor-react";
import { addComment, uploadAttachment } from "@/lib/tasks/actions";
```

- [ ] **Step 3: 파일 처리 핸들러 추가**

```tsx
const addFiles = (newFiles: FileList | File[]) => {
  const arr = Array.from(newFiles);
  setFiles((prev) => [...prev, ...arr]);
};

const removeFile = (index: number) => {
  setFiles((prev) => prev.filter((_, i) => i !== index));
};

const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  setDragOver(false);
  if (e.dataTransfer.files.length > 0) {
    addFiles(e.dataTransfer.files);
  }
};

const handlePaste = (e: React.ClipboardEvent) => {
  const items = e.clipboardData.items;
  const pastedFiles: File[] = [];
  for (let i = 0; i < items.length; i++) {
    const file = items[i].getAsFile();
    if (file) pastedFiles.push(file);
  }
  if (pastedFiles.length > 0) {
    addFiles(pastedFiles);
  }
};
```

- [ ] **Step 4: handleSubmit에 파일 업로드 로직 추가**

```tsx
const handleSubmit = async () => {
  if (!content.trim() && files.length === 0) return;
  setSending(true);
  try {
    // 파일이 있으면 먼저 업로드
    let metadata: Record<string, unknown> | undefined;
    if (files.length > 0) {
      const uploaded = await Promise.all(
        files.map((f) => uploadAttachment(taskId, userId, f))
      );
      metadata = {
        attachments: uploaded.map((a) => ({
          id: a.id,
          file_name: a.file_name,
          file_size: a.file_size,
          content_type: a.content_type,
          file_path: a.file_path,
        })),
      };
    }
    await addComment(taskId, userId, content.trim() || "파일을 첨부했습니다.", metadata);
    setContent("");
    setFiles([]);
    if (mode === "panel" && onRefresh) {
      onRefresh();
    } else {
      router.refresh();
    }
  } catch (error) {
    console.error("댓글 추가 실패:", error);
  } finally {
    setSending(false);
  }
};
```

- [ ] **Step 5: 렌더링 교체 — 드래그앤드롭 영역 + 파일 미리보기**

전체 return문을 교체:

```tsx
return (
  <div className="space-y-2">
    {/* 파일 미리보기 */}
    {files.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {files.map((file, i) => (
          <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded-lg text-xs text-slate-600">
            <Paperclip size={12} />
            <span className="max-w-[120px] truncate">{file.name}</span>
            <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    )}

    {/* 입력 영역 */}
    <div
      className={`flex gap-2 rounded-xl border-2 transition-colors ${
        dragOver ? "border-indigo-300 bg-indigo-50/50" : "border-transparent"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
        onPaste={handlePaste}
        placeholder={dragOver ? "파일을 놓으세요..." : "댓글을 입력하세요... (파일 붙여넣기/드래그 가능)"}
        className="flex-1 glass-input px-4 py-2.5 rounded-xl text-sm outline-none"
        disabled={sending}
      />
      <button
        onClick={handleSubmit}
        disabled={sending || (!content.trim() && files.length === 0)}
        className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-40 transition-all"
      >
        <PaperPlaneRight size={16} weight="bold" />
      </button>
    </div>
  </div>
);
```

- [ ] **Step 6: 커밋**

```bash
git add src/components/dashboard/tasks/detail/TaskCommentInput.tsx src/lib/tasks/actions.ts
git commit -m "기능: 댓글 입력에 드래그앤드롭/붙여넣기 파일 첨부 지원"
```

---

### Task 4: 활동 타임라인에 첨부파일 표시

댓글에 포함된 첨부 파일을 활동 타임라인에서 표시한다.

**Files:**
- Modify: `src/components/dashboard/tasks/detail/TaskActivityTimeline.tsx`

- [ ] **Step 1: 댓글 렌더링에 첨부파일 목록 추가**

`getActivityDescription` 함수 아래에 첨부파일 표시 컴포넌트 추가:

```tsx
interface AttachmentMeta {
  id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  file_path: string;
}

function CommentAttachments({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata?.attachments) return null;
  const attachments = metadata.attachments as AttachmentMeta[];
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {attachments.map((att) => {
        const isImage = att.content_type?.startsWith("image/");
        return (
          <div
            key={att.id}
            className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded-md text-xs text-slate-500"
          >
            <Paperclip size={11} />
            <span className="max-w-[150px] truncate">{att.file_name}</span>
            {isImage && <span className="text-[10px] text-indigo-400">이미지</span>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 활동 렌더링에 CommentAttachments 삽입**

활동 아이템의 description `<p>` 태그 아래에 추가:

```tsx
<p className={`text-sm mt-0.5 ${isComment ? "text-slate-600" : "text-slate-500"}`}>
  {getActivityDescription(activity)}
</p>
{isComment && (
  <CommentAttachments metadata={activity.metadata as Record<string, unknown> | null} />
)}
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/dashboard/tasks/detail/TaskActivityTimeline.tsx
git commit -m "UI: 활동 타임라인에 댓글 첨부파일 표시"
```

---

### Task 5: 빌드 검증

**Files:**
- 변경 없음 (검증만)

- [ ] **Step 1: TypeScript 빌드 확인**

```bash
npm run build
```

기대: 빌드 성공, 타입 에러 없음.

- [ ] **Step 2: 에러가 있다면 수정 후 커밋**

빌드 에러가 있으면 해당 파일을 수정하고 다시 빌드 확인:

```bash
git add -A
git commit -m "수정: 패널 간소화 빌드 에러 수정"
```
