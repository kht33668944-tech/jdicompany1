"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, XCircle } from "phosphor-react";
import { createTask } from "@/lib/tasks/actions";
import { toDateString } from "@/lib/utils/date";
import type { Profile } from "@/lib/attendance/types";
import { getErrorMessage } from "@/lib/utils/errors";
import ModalContainer from "@/components/shared/ModalContainer";
import UserAvatar from "@/components/shared/UserAvatar";

interface TaskCreateModalProps {
  userId: string;
  profiles: Profile[];
  onClose: () => void;
  onCreated?: () => void;
}

export default function TaskCreateModal({ userId, profiles, onClose, onCreated }: TaskCreateModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([userId]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const addAssignee = (id: string) => {
    if (id && !assigneeIds.includes(id)) {
      setAssigneeIds([...assigneeIds, id]);
    }
  };

  const removeAssignee = (id: string) => {
    setAssigneeIds(assigneeIds.filter((assigneeId) => assigneeId !== id));
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
        dueDate: dueDate || undefined,
        assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
      });
      if (onCreated) {
        onCreated();
      } else {
        router.refresh();
      }
      onClose();
    } catch (error) {
      setFeedback(getErrorMessage(error, "할 일 생성에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800">할 일 추가</h3>
        <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
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
          <label className="mb-1 block text-sm font-semibold text-slate-700">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="glass-input w-full rounded-xl px-4 py-2.5 text-sm outline-none"
            placeholder="오늘 처리할 업무를 입력하세요"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">설명</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="glass-input h-20 w-full resize-none rounded-xl px-4 py-2.5 text-sm outline-none"
            placeholder="필요한 참고사항이 있으면 적어주세요"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">데드라인</label>
          <input
            type="date"
            value={dueDate}
            min={toDateString()}
            onChange={(e) => setDueDate(e.target.value)}
            className="glass-input w-full rounded-xl px-4 py-2.5 text-sm outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">담당자</label>
          <div className="mb-2 flex flex-wrap gap-2">
            {assigneeIds.map((id) => {
              const profile = profiles.find((p) => p.id === id);
              return (
                <span
                  key={id}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-600"
                >
                  <UserAvatar name={profile?.full_name ?? "?"} avatarUrl={profile?.avatar_url} size="xs" />
                  {profile?.full_name ?? "알 수 없음"}
                  <button
                    type="button"
                    onClick={() => removeAssignee(id)}
                    className="transition-colors hover:text-red-500"
                  >
                    <XCircle size={14} />
                  </button>
                </span>
              );
            })}
          </div>
          <select
            value=""
            onChange={(e) => {
              addAssignee(e.target.value);
              e.target.value = "";
            }}
            className="glass-input w-full rounded-xl px-4 py-2.5 text-sm outline-none"
          >
            <option value="">+ 담당자 추가</option>
            {profiles
              .filter((profile) => !assigneeIds.includes(profile.id))
              .map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name}
                </option>
              ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading || !title.trim()}
          className="w-full rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-all duration-200 hover:from-brand-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "추가 중..." : "할 일 추가"}
        </button>
      </form>
    </ModalContainer>
  );
}
