"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Trash,
  XCircle,
} from "phosphor-react";
import type { Profile } from "@/lib/attendance/types";
import type {
  TaskWithDetails,
  TaskChecklistItem,
  TaskAttachment,
  TaskActivity,
  TaskStatus,
  TaskPriority,
} from "@/lib/tasks/types";
import { TASK_STATUSES, TASK_PRIORITIES, CATEGORIES, TASK_STATUS_CONFIG, PRIORITY_CONFIG } from "@/lib/tasks/constants";
import { updateTask, deleteTask, addAssignee, removeAssignee } from "@/lib/tasks/actions";
import TaskChecklist from "./TaskChecklist";
import TaskSubtasks from "./TaskSubtasks";
import TaskAttachments from "./TaskAttachments";
import TaskActivityTimeline from "./TaskActivityTimeline";
import TaskCommentInput from "./TaskCommentInput";
import UserAvatar from "@/components/shared/UserAvatar";

interface Props {
  task: TaskWithDetails;
  checklist: TaskChecklistItem[];
  subtasks: TaskWithDetails[];
  attachments: TaskAttachment[];
  activities: TaskActivity[];
  profiles: Profile[];
  userId: string;
}

import { getErrorMessage } from "@/lib/utils/errors";

export default function TaskDetailClient({
  task,
  checklist,
  subtasks,
  attachments,
  activities,
  profiles,
  userId,
}: Props) {
  const router = useRouter();
  const [liveActivities, setLiveActivities] = useState<TaskActivity[]>(activities);

  useEffect(() => {
    setLiveActivities(activities);
  }, [activities]);

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
  }, [task.id]);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [category, setCategory] = useState(task.category ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [startDate, setStartDate] = useState(task.start_date ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const currentProfile = profiles.find((p) => p.id === userId);
  const isAdmin = currentProfile?.role === "admin";
  const isCreator = task.created_by === userId;
  const isAssignee = task.assignees.some((a) => a.user_id === userId);
  const canEdit = isCreator || isAssignee || isAdmin;
  const canDelete = isCreator || isAdmin;

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
      router.refresh();
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
      router.push("/dashboard/tasks");
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: getErrorMessage(error, "삭제에 실패했습니다.") });
      setDeleting(false);
    }
  };

  const handleAddAssignee = async (assigneeUserId: string) => {
    try {
      await addAssignee(task.id, assigneeUserId, userId);
      router.refresh();
    } catch (error) {
      console.error("담당자 추가 실패:", error);
    }
  };

  const handleRemoveAssignee = async (assigneeUserId: string) => {
    try {
      await removeAssignee(task.id, assigneeUserId, userId);
      router.refresh();
    } catch (error) {
      console.error("담당자 제거 실패:", error);
    }
  };

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

          {/* 서브태스크 */}
          <TaskSubtasks
            taskId={task.id}
            subtasks={subtasks}
            userId={userId}
            profiles={profiles}
            canEdit={canEdit}
          />

          {/* 활동 타임라인 */}
          <div className="bg-white rounded-3xl shadow-sm p-6">
            <h3 className="font-bold text-slate-700 mb-4">활동</h3>
            <ActivityScrollArea activities={liveActivities} userId={userId} />
            <div className="mt-4 pt-4 border-t border-slate-100">
              <TaskCommentInput taskId={task.id} userId={userId} />
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
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="glass-input w-full px-3 py-2 rounded-lg text-sm outline-none"
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <span className={`text-sm font-medium ${TASK_STATUS_CONFIG[status].text}`}>
                  {status}
                </span>
              )}
            </div>

            {/* 우선순위 */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">우선순위</label>
              {canEdit ? (
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="glass-input w-full px-3 py-2 rounded-lg text-sm outline-none"
                >
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              ) : (
                <span className={`text-sm font-medium ${PRIORITY_CONFIG[priority].text}`}>
                  {priority}
                </span>
              )}
            </div>

            {/* 카테고리 */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">카테고리</label>
              {canEdit ? (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="glass-input w-full px-3 py-2 rounded-lg text-sm outline-none"
                >
                  <option value="">없음</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-slate-600">{category || "없음"}</span>
              )}
            </div>

            {/* 시작일 */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">시작일</label>
              {canEdit ? (
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="glass-input w-full px-3 py-2 rounded-lg text-sm outline-none"
                />
              ) : (
                <span className="text-sm text-slate-600">{startDate || "-"}</span>
              )}
            </div>

            {/* 마감일 */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">마감일</label>
              {canEdit ? (
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="glass-input w-full px-3 py-2 rounded-lg text-sm outline-none"
                />
              ) : (
                <span className="text-sm text-slate-600">{dueDate || "-"}</span>
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
                    {canEdit && (
                      <button
                        onClick={() => handleRemoveAssignee(a.user_id)}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) handleAddAssignee(e.target.value);
                    }}
                    className="glass-input w-full px-3 py-2 rounded-lg text-sm outline-none text-slate-400"
                  >
                    <option value="">+ 담당자 추가</option>
                    {profiles
                      .filter((p) => !task.assignees.some((a) => a.user_id === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.full_name}</option>
                      ))}
                  </select>
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
