"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash, X } from "phosphor-react";
import { deleteTask, updateTask } from "@/lib/tasks/actions";
import { CATEGORIES, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/tasks/constants";
import TaskComments from "./TaskComments";
import { toDateString } from "@/lib/utils/date";
import type { Profile } from "@/lib/attendance/types";
import type { TaskPriority, TaskStatus, TaskWithProfile } from "@/lib/tasks/types";

interface TaskDetailModalProps {
  task: TaskWithProfile;
  userId: string;
  profiles: Profile[];
  onClose: () => void;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export default function TaskDetailModal({ task, userId, profiles, onClose }: TaskDetailModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [category, setCategory] = useState(task.category ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [assignedTo, setAssignedTo] = useState(task.assigned_to ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const currentProfile = profiles.find((profile) => profile.id === userId);
  const isAdmin = currentProfile?.role === "admin";
  const canDelete = task.created_by === userId || isAdmin;
  const canEdit = task.created_by === userId || task.assigned_to === userId || isAdmin;
  const assigneeName = profiles.find((profile) => profile.id === assignedTo)?.full_name ?? "미지정";

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setFeedback(null);

    try {
      await updateTask(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        category: category || null,
        dueDate: dueDate || null,
        assignedTo: assignedTo || null,
      });
      router.refresh();
      onClose();
    } catch (error) {
      setFeedback(getErrorMessage(error, "할일 수정에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("이 할일을 삭제하시겠습니까?")) return;
    setDeleting(true);
    setFeedback(null);

    try {
      await deleteTask(task.id);
      router.refresh();
      onClose();
    } catch (error) {
      setFeedback(getErrorMessage(error, "할일 삭제에 실패했습니다."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative glass-card rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">할일 상세</h3>
          <div className="flex items-center gap-1">
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash size={18} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
          <div className="flex items-center justify-between">
            <span>수정 가능 여부</span>
            <span className={`font-semibold ${canEdit ? "text-emerald-600" : "text-slate-500"}`}>
              {canEdit ? "수정 가능" : "읽기 전용"}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span>현재 담당자</span>
            <span className="font-semibold text-slate-800">{assigneeName}</span>
          </div>
        </div>

        {feedback && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {feedback}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">제목</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={!canEdit}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">설명</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={!canEdit}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none h-20 disabled:opacity-60"
              placeholder="세부 설명"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">상태</label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as TaskStatus)}
                disabled={!canEdit}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none disabled:opacity-60"
              >
                {TASK_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">우선순위</label>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as TaskPriority)}
                disabled={!canEdit}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none disabled:opacity-60"
              >
                {TASK_PRIORITIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">카테고리</label>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                disabled={!canEdit}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none disabled:opacity-60"
              >
                <option value="">없음</option>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">마감일</label>
              <input
                type="date"
                value={dueDate}
                min={toDateString()}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={!canEdit}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">담당자</label>
            <select
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              disabled={!canEdit}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none disabled:opacity-60"
            >
              <option value="">미지정</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>생성자: {task.creator_profile.full_name}</span>
            <span>·</span>
            <span>{new Date(task.created_at).toLocaleDateString("ko-KR")}</span>
          </div>

          {canEdit ? (
            <button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-500/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Check size={16} weight="bold" />
              {saving ? "저장 중..." : "저장"}
            </button>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              이 할일은 현재 읽기 전용입니다. 생성자, 담당자 또는 관리자만 수정할 수 있습니다.
            </div>
          )}

          <TaskComments taskId={task.id} userId={userId} />
        </div>
      </div>
    </div>
  );
}
