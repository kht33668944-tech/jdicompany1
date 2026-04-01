"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "phosphor-react";
import { createTask } from "@/lib/tasks/actions";
import { CATEGORIES, TASK_PRIORITIES } from "@/lib/tasks/constants";
import { toDateString } from "@/lib/utils/date";
import type { Profile } from "@/lib/attendance/types";
import type { TaskPriority } from "@/lib/tasks/types";

interface TaskCreateModalProps {
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

export default function TaskCreateModal({ userId, profiles, onClose }: TaskCreateModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(TASK_PRIORITIES[2]);
  const [category, setCategory] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState(userId);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const assigneeName = profiles.find((profile) => profile.id === assignedTo)?.full_name ?? "미지정";

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
        createdBy: userId,
        assignedTo: assignedTo || undefined,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative glass-card rounded-2xl p-6 w-full max-w-lg animate-fade-in-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">할일 추가</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
          <div className="flex items-center justify-between">
            <span>기본 담당자</span>
            <span className="font-semibold text-slate-800">{assigneeName}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span>오늘 날짜</span>
            <span className="font-semibold text-slate-800">{toDateString()}</span>
          </div>
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
              onChange={(event) => setTitle(event.target.value)}
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
              onChange={(event) => setDescription(event.target.value)}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none h-20"
              placeholder="완료 기준이나 참고 사항이 있으면 적어주세요."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">우선순위</label>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as TaskPriority)}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              >
                {TASK_PRIORITIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">카테고리</label>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              >
                <option value="">없음</option>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">마감일</label>
              <input
                type="date"
                value={dueDate}
                min={toDateString()}
                onChange={(event) => setDueDate(event.target.value)}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">담당자</label>
              <select
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              >
                <option value="">미지정</option>
                {profiles.map((profile) => (
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
            {loading ? "추가 중..." : "할일 추가"}
          </button>
        </form>
      </div>
    </div>
  );
}
