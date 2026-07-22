"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  CheckCircle,
  ShareNetwork,
  SpinnerGap,
  Trash,
  XCircle,
  X,
} from "phosphor-react";
import type { DashboardTaskPerson } from "@/lib/dashboard/dashboard-task-summary";
import type {
  TaskWithDetails,
  TaskChecklistItem,
  TaskAttachment,
  TaskActivity,
  TaskPriority,
  TaskStatus,
} from "@/lib/tasks/types";
import {
  CATEGORIES,
  PRIORITY_CONFIG,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_CONFIG,
} from "@/lib/tasks/constants";
import { updateTask, deleteTask, addAssignee, removeAssignee } from "@/lib/tasks/actions";
import { useProjects } from "@/lib/projects/useProjects";
import TaskChecklist from "./TaskChecklist";
import TaskAttachments from "./TaskAttachments";
import TaskActivityTimeline from "./TaskActivityTimeline";
import TaskCommentInput from "./TaskCommentInput";
import UserAvatar from "@/components/shared/UserAvatar";
import Select from "@/components/shared/Select";
import WorkTimelineCreateModal from "@/components/dashboard/work-timeline/WorkTimelineCreateModal";
import { getTaskTimelineShare } from "@/lib/work-timeline/actions";
import type { WorkTimelineTaskShareState } from "@/lib/work-timeline/types";

interface Props {
  task: TaskWithDetails;
  checklist: TaskChecklistItem[];
  attachments: TaskAttachment[];
  activities: TaskActivity[];
  profiles: DashboardTaskPerson[];
  userId: string;
  /** "page" (기본값) = 기존 전체 페이지, "panel" = 슬라이드 패널 */
  mode?: "page" | "panel";
  /** panel 모드 전용: 패널 닫기 */
  onClose?: () => void;
  /** panel 모드 전용: 데이터 재조회 트리거 */
  onRefresh?: () => void;
}

import { getErrorMessage } from "@/lib/utils/errors";

interface CompletedTaskTimelineShareProps {
  task: TaskWithDetails;
  canShare: boolean;
  currentUserId: string;
  onShared: () => void;
}

function CompletedTaskTimelineShare({
  task,
  canShare,
  currentUserId,
  onShared,
}: CompletedTaskTimelineShareProps) {
  const [shareResult, setShareResult] = useState<{
    requestKey: string;
    state: WorkTimelineTaskShareState | null;
    failed: boolean;
  } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestKey = `${task.id}:${refreshKey}`;

  useEffect(() => {
    if (task.status !== "완료" || !canShare) return;

    let cancelled = false;
    getTaskTimelineShare(task.id)
      .then((nextState) => {
        if (!cancelled) {
          setShareResult({ requestKey, state: nextState, failed: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setShareResult({ requestKey, state: null, failed: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canShare, requestKey, task.id, task.status]);

  if (task.status !== "완료" || !canShare) return null;

  const loading = shareResult?.requestKey !== requestKey;
  const loadFailed = shareResult?.requestKey === requestKey && shareResult.failed;
  const shareState = shareResult?.requestKey === requestKey ? shareResult.state : null;
  const alreadyShared = shareState?.reason === "already_shared";
  const existingEntryId = alreadyShared ? shareState.existingEntryId : null;
  const available = shareState?.canShare === true && Boolean(shareState.task);

  const handleButtonClick = () => {
    if (loadFailed) {
      setRefreshKey((current) => current + 1);
      return;
    }
    if (available) setShowCreate(true);
  };

  return (
    <>
      {existingEntryId ? (
        <Link
          href={`/dashboard/work-timeline/${existingEntryId}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-600 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          aria-label="공유된 타임라인 업무 상세 보기"
        >
          <CheckCircle size={15} weight="fill" aria-hidden="true" />
          타임라인 공유됨
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleButtonClick}
          disabled={loading || alreadyShared || (!available && !loadFailed)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-default disabled:text-slate-400"
        >
          {loading ? (
            <SpinnerGap size={15} className="animate-spin" aria-hidden="true" />
          ) : alreadyShared ? (
            <CheckCircle size={15} weight="fill" aria-hidden="true" />
          ) : (
            <ShareNetwork size={15} weight="bold" aria-hidden="true" />
          )}
          {loading
            ? "공유 확인 중"
            : alreadyShared
              ? "타임라인 공유됨"
              : loadFailed
                ? "공유 상태 다시 확인"
                : "타임라인에 공유"}
        </button>
      )}

      {showCreate && shareState?.task && (
        <WorkTimelineCreateModal
          open
          currentUserId={currentUserId}
          onClose={() => setShowCreate(false)}
          onCreated={(entryId) => {
            setShareResult((current) => current?.requestKey === requestKey && current.state ? {
              requestKey,
              failed: false,
              state: {
                ...current.state,
                canShare: false,
                existingEntryId: entryId,
                reason: "already_shared",
              },
            } : current);
            setShowCreate(false);
            onShared();
          }}
          initialTitle={shareState.task.title}
          initialDescription={shareState.task.description ?? ""}
          initialCompletedAt={shareState.task.completedAt}
          taskId={task.id}
        />
      )}
    </>
  );
}

export default function TaskDetailClient({
  task,
  checklist,
  attachments,
  activities,
  profiles,
  userId,
  mode = "page",
  onClose,
  onRefresh,
}: Props) {
  const router = useRouter();
  const [liveActivities, setLiveActivities] = useState<TaskActivity[]>(activities);
  const activityScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLiveActivities(activities);
  }, [activities]);

  // 패널 모드: 활동 목록 변경 시 맨 아래로 스크롤
  useEffect(() => {
    if (mode === "panel" && activityScrollRef.current) {
      activityScrollRef.current.scrollTop = activityScrollRef.current.scrollHeight;
    }
  }, [liveActivities.length, mode]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`task-activities:${task.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "task_activities",
          filter: `task_id=eq.${task.id}`,
        },
        async (payload) => {
          // 프로필 정보 포함하여 조회
          const { data } = await supabase
            .from("task_activities")
            .select("*, user_profile:profiles!task_activities_user_id_fkey(full_name, avatar_url)")
            .eq("id", payload.new.id)
            .single();
          if (data) {
            setLiveActivities((prev) => {
              if (prev.some((a) => a.id === data.id)) return prev;
              return [...prev, data as TaskActivity];
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "task_activities",
          filter: `task_id=eq.${task.id}`,
        },
        (payload) => {
          setLiveActivities((prev) => prev.filter((a) => a.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    task.description,
    task.due_date,
    task.id,
    task.status,
    task.title,
  ]);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [category, setCategory] = useState(task.category ?? "");
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const { projects } = useProjects();
  const [startDate, setStartDate] = useState(task.start_date ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // 다른 할일로 라우팅되거나 외부 변경이 prop 으로 들어왔을 때 편집 폼 재동기화
  // (task.id 가 같으면 사용자가 편집 중일 수 있어 덮어쓰지 않음)
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setStatus(task.status);
    setPriority(task.priority);
    setCategory(task.category ?? "");
    setProjectId(task.project_id ?? "");
    setStartDate(task.start_date ?? "");
    setDueDate(task.due_date ?? "");
  }, [
    task.category,
    task.description,
    task.due_date,
    task.id,
    task.priority,
    task.project_id,
    task.start_date,
    task.status,
    task.title,
  ]);

  const currentProfile = profiles.find((p) => p.id === userId);
  const isAdmin = currentProfile?.role === "admin";
  const isCreator = task.created_by === userId;
  const isAssignee = task.assignees.some((a) => a.user_id === userId);
  const canEdit = isCreator || isAssignee || isAdmin;
  const canDelete = isCreator || isAdmin;
  const canManageAssignees = isCreator || isAdmin;

  const projectOptions = [
    { value: "", label: "미분류" },
    ...projects
      .filter((project) => !project.is_archived || project.id === projectId)
      .map((project) => ({ value: project.id, label: project.name })),
  ];

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await updateTask(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        category: category.trim() || null,
        projectId: projectId || null,
        startDate: startDate || null,
        dueDate: dueDate || null,
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

  const handleAddAssignee = async (assigneeUserId: string) => {
    try {
      await addAssignee(task.id, assigneeUserId);
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
      await removeAssignee(task.id, assigneeUserId);
      if (mode === "panel" && onRefresh) {
        onRefresh();
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error("담당자 제거 실패:", error);
    }
  };

  // 패널 모드: 전체 높이 flex 레이아웃
  if (mode === "panel") {
    return (
      <div className="h-[calc(100vh-3rem)] overflow-y-auto pr-1 sm:h-[calc(100vh-4rem)]">
        {/* 상단 고정: 닫기/저장 */}
        <div className="sticky top-0 z-10 mb-3 flex items-center justify-between bg-slate-50 py-1">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors text-sm font-medium"
          >
            <X size={18} />
            닫기
          </button>
          <div className="flex items-center gap-2">
            <CompletedTaskTimelineShare
              task={task}
              canShare={isCreator || isAssignee}
              currentUserId={userId}
              onShared={() => {
                onRefresh?.();
                router.refresh();
              }}
            />
            {canEdit && (
              <button
                type="button"
                aria-label="업무 저장"
                onClick={handleSave}
                disabled={saving || !title.trim()}
                className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all disabled:opacity-40"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                aria-label={`${task.title} 삭제`}
                onClick={handleDelete}
                disabled={deleting}
                className="p-2 rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? <span className="text-xs px-1">삭제 중...</span> : <Trash size={18} />}
              </button>
            )}
          </div>
        </div>

        {feedback && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm mb-3 shrink-0 ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {feedback.message}
          </div>
        )}

        {/* 제목과 주요 속성 */}
        <div className="mb-3 rounded-lg bg-white p-4 shadow-sm">
          {canEdit ? (
            <input
              aria-label="할일 제목"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-lg font-bold text-slate-800 outline-none bg-transparent"
              placeholder="할일 제목"
            />
          ) : (
            <h1 className="text-lg font-bold text-slate-800">{title}</h1>
          )}

          <div className="mt-4">
            <label className="mb-1 block text-xs font-bold text-slate-400">설명</label>
            <textarea
              aria-label="업무 설명"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              readOnly={!canEdit}
              className="glass-input min-h-20 w-full resize-y rounded-lg px-3 py-2 text-sm outline-none read-only:bg-slate-50"
              placeholder="업무 설명"
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-400">상태</label>
              <Select
                ariaLabel="업무 상태"
                value={status}
                onChange={(v) => setStatus(v as TaskStatus)}
                disabled={!canEdit}
                className="glass-input w-full rounded-lg px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                options={TASK_STATUSES.map((item) => ({
                  value: item,
                  label: item,
                  dotClass: TASK_STATUS_CONFIG[item].dot,
                }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-400">우선순위</label>
              <Select
                ariaLabel="업무 우선순위"
                value={priority}
                onChange={(v) => setPriority(v as TaskPriority)}
                disabled={!canEdit}
                className="glass-input w-full rounded-lg px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                options={TASK_PRIORITIES.map((item) => ({
                  value: item,
                  label: item,
                  dotClass: PRIORITY_CONFIG[item].dot,
                }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-400">시작일</label>
              <input
                aria-label="업무 시작일"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                readOnly={!canEdit}
                className="glass-input w-full rounded-lg px-3 py-2 text-sm outline-none read-only:bg-slate-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-400">데드라인</label>
              <input
                aria-label="업무 데드라인"
                type="date"
                value={dueDate}
                min={startDate || undefined}
                onChange={(e) => setDueDate(e.target.value)}
                readOnly={!canEdit}
                className="glass-input w-full rounded-lg px-3 py-2 text-sm outline-none read-only:bg-slate-50"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-400">프로젝트</label>
              <Select
                ariaLabel="프로젝트"
                value={projectId}
                onChange={(v) => setProjectId(v)}
                disabled={!canEdit}
                className="glass-input w-full rounded-lg px-3 py-2 text-sm outline-none disabled:bg-slate-50"
                options={projectOptions}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-400">업무 분류</label>
              <input
                aria-label="업무 분류"
                type="text"
                list={`task-categories-${task.id}`}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                readOnly={!canEdit}
                className="glass-input w-full rounded-lg px-3 py-2 text-sm outline-none read-only:bg-slate-50"
                placeholder="업무 분류 선택 또는 직접 입력"
              />
              <datalist id={`task-categories-${task.id}`}>
                {CATEGORIES.map((item) => <option key={item} value={item} />)}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-400">담당자</label>
              <div className="flex flex-wrap gap-2">
                {task.assignees.map((assignee) => (
                  <span
                    key={assignee.user_id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600"
                  >
                    <UserAvatar name={assignee.full_name} avatarUrl={assignee.avatar_url} size="xs" />
                    {assignee.full_name}
                    {canManageAssignees && (
                      <button
                        type="button"
                        onClick={() => handleRemoveAssignee(assignee.user_id)}
                        className="text-indigo-300 transition-colors hover:text-red-500"
                        aria-label={`${assignee.full_name} 담당자 제외`}
                      >
                        <XCircle size={14} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {canManageAssignees && (
                <Select
                  ariaLabel="담당자 추가"
                  value=""
                  resetOnSelect
                  onChange={(v) => {
                    if (v) handleAddAssignee(v);
                  }}
                  placeholder="+ 담당자 추가"
                  className="glass-input mt-2 w-full rounded-lg px-3 py-2 text-sm text-slate-500 outline-none"
                  options={profiles
                    .filter((profile) => !task.assignees.some((assignee) => assignee.user_id === profile.id))
                    .map((profile) => ({ value: profile.id, label: profile.full_name }))}
                />
              )}
            </div>
          </div>
        </div>

        {/* 체크리스트: 접히고 스크롤 가능 */}
        <div className="mb-3 max-h-[30vh] overflow-y-auto rounded-lg bg-white shadow-sm">
          <div className="p-4">
            <TaskChecklist
              taskId={task.id}
              items={checklist}
              canEdit={canEdit}
              mode="panel"
              onRefresh={onRefresh}
            />
          </div>
        </div>

        {/* 활동: 나머지 공간 차지 */}
        <div className="flex min-h-72 flex-col rounded-lg bg-white shadow-sm">
          <div className="px-4 pt-4 pb-2 shrink-0">
            <h3 className="font-bold text-slate-700 text-sm">활동</h3>
          </div>
          <div ref={activityScrollRef} className="flex-1 min-h-0 overflow-y-auto px-4">
            <TaskActivityTimeline activities={liveActivities} userId={userId} />
          </div>
          <div className="px-4 py-3 border-t border-slate-100 shrink-0">
            <TaskCommentInput taskId={task.id} mode={mode} onRefresh={onRefresh} />
          </div>
        </div>
      </div>
    );
  }

  // page 모드: 기존 레이아웃
  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/dashboard/tasks")}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors text-sm font-medium"
        >
          <ArrowLeft size={18} />
          뒤로 가기
        </button>
        <div className="flex items-center gap-2">
          <CompletedTaskTimelineShare
            task={task}
            canShare={isCreator || isAssignee}
            currentUserId={userId}
            onShared={() => router.refresh()}
          />
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all disabled:opacity-40"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              aria-label={`${task.title} 삭제`}
              onClick={handleDelete}
              disabled={deleting}
              className="p-2 rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {deleting ? <span className="text-xs px-1">삭제 중...</span> : <Trash size={18} />}
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* 본문 + 사이드바 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* 좌측: 본문 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 제목 */}
          <div className="bg-white rounded-3xl shadow-sm p-6">
            {canEdit ? (
              <input
                aria-label="할일 제목"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xl font-bold text-slate-800 outline-none bg-transparent"
                placeholder="할일 제목"
              />
            ) : (
              <h1 className="text-xl font-bold text-slate-800">{title}</h1>
            )}

            <div className="mt-4">
              <label className="text-sm font-semibold text-slate-500 mb-2 block">설명</label>
              {canEdit ? (
                <textarea
                  aria-label="업무 설명"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full glass-input px-4 py-3 rounded-xl text-sm outline-none resize-none min-h-[80px]"
                  placeholder="설명을 입력하세요..."
                />
              ) : (
                <p className="text-sm text-slate-600 whitespace-pre-wrap">
                  {description || "설명 없음"}
                </p>
              )}
            </div>
          </div>

          {/* 체크리스트 */}
          <TaskChecklist
            taskId={task.id}
            items={checklist}
            canEdit={canEdit}
          />

          {/* 활동 타임라인 */}
          <div className="bg-white rounded-3xl shadow-sm p-6">
            <h3 className="font-bold text-slate-700 mb-4">활동</h3>
            <ActivityScrollArea activities={liveActivities} userId={userId} />
            <div className="mt-4 pt-4 border-t border-slate-100">
              <TaskCommentInput taskId={task.id} />
            </div>
          </div>
        </div>

        {/* 우측: 사이드바 */}
        <div className="space-y-6">
          {/* 속성 */}
          <div className="bg-white rounded-3xl shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-700">속성</h3>

            {/* 상태 */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">상태</label>
              {canEdit ? (
                <Select
                  ariaLabel="업무 상태"
                  value={status}
                  onChange={(v) => setStatus(v as TaskStatus)}
                  className="glass-input w-full px-3 py-2 rounded-lg text-sm outline-none"
                  options={TASK_STATUSES.map((s) => ({
                    value: s,
                    label: s,
                    dotClass: TASK_STATUS_CONFIG[s].dot,
                  }))}
                />
              ) : (
                <span className={`text-sm font-medium ${TASK_STATUS_CONFIG[status].text}`}>
                  {status}
                </span>
              )}
            </div>

            {/* 마감일 */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">데드라인</label>
              {canEdit ? (
                <input
                  aria-label="업무 데드라인"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="glass-input w-full px-3 py-2 rounded-lg text-sm outline-none"
                />
              ) : (
                <span className="text-sm text-slate-600">{dueDate || "-"}</span>
              )}
            </div>

            {/* 프로젝트 */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">프로젝트</label>
              {canEdit ? (
                <Select
                  ariaLabel="프로젝트"
                  value={projectId}
                  onChange={(v) => setProjectId(v)}
                  className="glass-input w-full px-3 py-2 rounded-lg text-sm outline-none"
                  options={projectOptions}
                />
              ) : (
                <span className="text-sm text-slate-600">{task.project?.name ?? "미분류"}</span>
              )}
            </div>

            {/* 담당자 */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">담당자</label>
              <div className="space-y-2">
                {task.assignees.map((a) => (
                  <div key={a.user_id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserAvatar name={a.full_name} avatarUrl={a.avatar_url} size="sm" />
                      <span className="text-sm text-slate-600">{a.full_name}</span>
                    </div>
                    {canManageAssignees && (
                      <button
                        onClick={() => handleRemoveAssignee(a.user_id)}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
                ))}
                {canManageAssignees && (
                  <Select
                    ariaLabel="담당자 추가"
                    value=""
                    resetOnSelect
                    onChange={(v) => {
                      if (v) handleAddAssignee(v);
                    }}
                    placeholder="+ 담당자 추가"
                    className="glass-input w-full px-3 py-2 rounded-lg text-sm outline-none text-slate-400"
                    options={profiles
                      .filter((p) => !task.assignees.some((a) => a.user_id === p.id))
                      .map((p) => ({ value: p.id, label: p.full_name }))}
                  />
                )}
              </div>
            </div>

            {/* 생성자 / 생성일 */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>생성자</span>
                <div className="flex items-center gap-1.5">
                  <UserAvatar name={task.creator_profile.full_name} avatarUrl={task.creator_profile.avatar_url} size="xs" />
                  <span className="text-slate-600">{task.creator_profile.full_name}</span>
                </div>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>생성일</span>
                <span className="text-slate-600">{task.created_at.slice(0, 10)}</span>
              </div>
            </div>
          </div>

          {/* 첨부파일 */}
          <TaskAttachments
            taskId={task.id}
            attachments={attachments}
            userId={userId}
            canEdit={canEdit}
          />
        </div>
      </div>
    </div>
  );
}

/** 활동 영역 — 자동 스크롤 */
function ActivityScrollArea({ activities, userId }: { activities: TaskActivity[]; userId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities.length]);

  return (
    <div ref={scrollRef} className="max-h-96 overflow-y-auto pr-1">
      <TaskActivityTimeline activities={activities} userId={userId} />
    </div>
  );
}
