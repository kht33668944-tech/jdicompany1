"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, XCircle } from "phosphor-react";
import { createTask } from "@/lib/tasks/actions";
import { CATEGORIES, TASK_PRIORITIES } from "@/lib/tasks/constants";
import { toDateString } from "@/lib/utils/date";
import type { Profile } from "@/lib/attendance/types";
import type { TaskPriority } from "@/lib/tasks/types";
import { getErrorMessage } from "@/lib/utils/errors";
import ModalContainer from "@/components/shared/ModalContainer";

interface TaskCreateModalProps {
  userId: string;
  profiles: Profile[];
  onClose: () => void;
  parentId?: string;
}

export default function TaskCreateModal({ userId, profiles, onClose, parentId }: TaskCreateModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(TASK_PRIORITIES[2]);
  const [category, setCategory] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([userId]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const addAssignee = (id: string) => {
    if (id && !assigneeIds.includes(id)) {
      setAssigneeIds([...assigneeIds, id]);
    }
  };

  const removeAssignee = (id: string) => {
    setAssigneeIds(assigneeIds.filter((a) => a !== id));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setFeedback(null);
    try {
      await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        category: category || undefined,
        dueDate: dueDate || undefined,
        startDate: startDate || undefined,
        createdBy: userId,
        assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
        parentId: parentId || undefined,
      });
      router.refresh();
      onClose();
    } catch (error) {
      setFeedback(getErrorMessage(error, "할일 생성에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer onClose={onClose}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">
            {parentId ? "서브태스크 추가" : "할일 추가"}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        {feedback && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {feedback}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              placeholder="예: 월간 보고서 초안 작성"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">설명</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none h-20"
              placeholder="완료 기준이나 참고 사항이 있으면 적어주세요."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">우선순위</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              >
                {TASK_PRIORITIES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">카테고리</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              >
                <option value="">없음</option>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">시작일</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">마감일</label>
              <input
                type="date"
                value={dueDate}
                min={startDate || toDateString()}
                onChange={(e) => setDueDate(e.target.value)}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              />
            </div>
          </div>

          {/* 담당자 (다수 선택) */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">담당자</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {assigneeIds.map((id) => {
                const profile = profiles.find((p) => p.id === id);
                return (
                  <span
                    key={id}
                    className="flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium"
                  >
                    {profile?.full_name ?? "알 수 없음"}
                    <button
                      type="button"
                      onClick={() => removeAssignee(id)}
                      className="hover:text-red-500 transition-colors"
                    >
                      <XCircle size={14} />
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="flex gap-2">
              <select
                value=""
                onChange={(e) => {
                  addAssignee(e.target.value);
                  e.target.value = "";
                }}
                className="glass-input flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
              >
                <option value="">+ 담당자 추가</option>
                {profiles
                  .filter((p) => !assigneeIds.includes(p.id))
                  .map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-500/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "추가 중..." : parentId ? "서브태스크 추가" : "할일 추가"}
          </button>
        </form>
    </ModalContainer>
  );
}
