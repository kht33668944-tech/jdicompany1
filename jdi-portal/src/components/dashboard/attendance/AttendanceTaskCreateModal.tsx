"use client";

import { useEffect, useState } from "react";
import { CaretDown, CaretUp, Plus, Trash, X } from "phosphor-react";
import ModalContainer from "@/components/shared/ModalContainer";
import { createSelfTasks } from "@/lib/tasks/actions";
import { addDays, toDateString } from "@/lib/utils/date";
import { getErrorMessage } from "@/lib/utils/errors";

interface AttendanceTaskCreateModalProps {
  initialDueDate: string;
  draftKey: string;
  onClose: () => void;
}

interface AttendanceTaskDraftItem {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  expanded: boolean;
}

interface AttendanceTaskDraft {
  tasks: AttendanceTaskDraftItem[];
  commonDueDate: string;
}

const MAX_TASKS = 20;

function createDraftItem(id: string, dueDate: string): AttendanceTaskDraftItem {
  return { id, title: "", description: "", dueDate, expanded: false };
}

function dueDateLabel(dueDate: string, today: string): string {
  if (!dueDate) return "마감 없음";
  if (dueDate === today) return "오늘";
  if (dueDate === addDays(today, 1)) return "내일";
  const [, month, day] = dueDate.split("-").map(Number);
  return `${month}월 ${day}일`;
}

function thisFriday(date: string): string {
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, (5 - dayOfWeek + 7) % 7);
}

export default function AttendanceTaskCreateModal({
  initialDueDate,
  draftKey,
  onClose,
}: AttendanceTaskCreateModalProps) {
  const today = toDateString();
  const [tasks, setTasks] = useState<AttendanceTaskDraftItem[]>([
    createDraftItem("attendance-task-1", initialDueDate),
  ]);
  const [commonDueDate, setCommonDueDate] = useState(initialDueDate);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  useEffect(() => {
    try {
      const savedDraft = window.localStorage.getItem(draftKey);
      if (!savedDraft) return;

      const draft = JSON.parse(savedDraft) as Partial<AttendanceTaskDraft> & {
        title?: string;
        description?: string;
        dueDate?: string;
      };
      if (Array.isArray(draft.tasks) && draft.tasks.length > 0) {
        setTasks(draft.tasks.slice(0, MAX_TASKS).map((task, index) => ({
          id: typeof task.id === "string" ? task.id : `attendance-task-${index + 1}`,
          title: typeof task.title === "string" ? task.title : "",
          description: typeof task.description === "string" ? task.description : "",
          dueDate: typeof task.dueDate === "string" ? task.dueDate : initialDueDate,
          expanded: Boolean(task.expanded),
        })));
        setCommonDueDate(typeof draft.commonDueDate === "string" ? draft.commonDueDate : initialDueDate);
      } else if (typeof draft.title === "string") {
        // 기존 1건 작성 화면에서 저장된 임시 내용을 보존한다.
        setTasks([{
          id: "attendance-task-1",
          title: draft.title,
          description: typeof draft.description === "string" ? draft.description : "",
          dueDate: typeof draft.dueDate === "string" ? draft.dueDate : initialDueDate,
          expanded: Boolean(draft.description),
        }]);
      }
    } catch {
      // 저장 공간 오류가 업무 작성을 막지 않도록 한다.
    } finally {
      setDraftReady(true);
    }
  }, [draftKey, initialDueDate]);

  useEffect(() => {
    if (!draftReady) return;

    const timer = window.setTimeout(() => {
      try {
        const hasDraft = tasks.some((task) => task.title.trim() || task.description.trim() || task.dueDate !== initialDueDate);
        if (!hasDraft && tasks.length === 1) {
          window.localStorage.removeItem(draftKey);
          return;
        }
        const draft: AttendanceTaskDraft = { tasks, commonDueDate };
        window.localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        // 저장 공간 오류가 업무 작성을 막지 않도록 한다.
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [commonDueDate, draftKey, draftReady, initialDueDate, tasks]);

  const updateTask = (id: string, patch: Partial<AttendanceTaskDraftItem>) => {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task));
  };

  const addTask = () => {
    if (tasks.length >= MAX_TASKS) {
      setFeedback(`업무는 한 번에 최대 ${MAX_TASKS}개까지 등록할 수 있습니다.`);
      return;
    }
    setFeedback(null);
    setTasks((current) => [
      ...current,
      createDraftItem(`attendance-task-${Date.now()}-${current.length}`, commonDueDate),
    ]);
  };

  const removeTask = (id: string) => {
    setTasks((current) => current.length === 1 ? current : current.filter((task) => task.id !== id));
  };

  const applyCommonDueDate = () => {
    setTasks((current) => current.map((task) => ({ ...task, dueDate: commonDueDate })));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback(null);

    if (tasks.some((task) => !task.title.trim())) {
      setFeedback("모든 업무의 제목을 입력해주세요.");
      return;
    }

    const titles = tasks.map((task) => task.title.trim().toLocaleLowerCase("ko-KR"));
    if (new Set(titles).size !== titles.length) {
      setFeedback("같은 제목의 업무가 중복되어 있습니다.");
      return;
    }

    setLoading(true);
    try {
      await createSelfTasks(tasks.map((task) => ({
        title: task.title,
        description: task.description || undefined,
        dueDate: task.dueDate || undefined,
      })));
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // 생성은 완료되었으므로 저장 공간 오류는 무시한다.
      }
      onClose();
    } catch (error) {
      setFeedback(getErrorMessage(error, "업무 등록에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer onClose={onClose} maxWidth="max-w-2xl" className="max-h-[90vh] overflow-y-auto">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-800">오늘 내 업무 작성</h3>
          <p className="mt-1 text-xs text-slate-500">오늘 처리할 업무를 여러 개 등록할 수 있습니다.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="나중에 작성" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
          <X size={20} />
        </button>
      </div>

      {feedback && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {feedback}
        </div>
      )}

      <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs font-semibold text-slate-600">
            공통 데드라인
            <input
              type="date"
              min={today}
              value={commonDueDate}
              onChange={(event) => setCommonDueDate(event.target.value)}
              className="glass-input mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCommonDueDate("")} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              마감 없음
            </button>
            <button type="button" onClick={applyCommonDueDate} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500">
              모든 업무에 적용
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-3">
          {tasks.map((task, index) => (
            <div key={task.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={task.title}
                    onChange={(event) => updateTask(task.id, { title: event.target.value })}
                    placeholder="오늘 처리할 업무를 입력하세요"
                    aria-label={`${index + 1}번째 업무 제목`}
                    autoFocus={index === 0}
                    className="glass-input w-full rounded-lg px-3 py-2 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => updateTask(task.id, { expanded: !task.expanded })}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-600"
                  >
                    {dueDateLabel(task.dueDate, today)} · 상세 설정
                    {task.expanded ? <CaretUp size={13} /> : <CaretDown size={13} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeTask(task.id)}
                  disabled={tasks.length === 1}
                  aria-label={`${index + 1}번째 업무 삭제`}
                  className="mt-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash size={17} />
                </button>
              </div>

              {task.expanded && (
                <div className="ml-8 mt-3 space-y-3 border-t border-slate-100 pt-3">
                  <label className="block text-xs font-semibold text-slate-600">
                    설명
                    <textarea
                      value={task.description}
                      onChange={(event) => updateTask(task.id, { description: event.target.value })}
                      placeholder="필요한 참고사항이 있으면 적어주세요"
                      className="glass-input mt-1 h-20 w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
                    />
                  </label>
                  <div>
                    <span className="text-xs font-semibold text-slate-600">데드라인</span>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => updateTask(task.id, { dueDate: today })} className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600">
                        오늘
                      </button>
                      <button type="button" onClick={() => updateTask(task.id, { dueDate: addDays(today, 1) })} className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600">
                        내일
                      </button>
                      <button type="button" onClick={() => updateTask(task.id, { dueDate: thisFriday(today) })} className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600">
                        이번 주 금요일
                      </button>
                      <input
                        type="date"
                        min={today}
                        value={task.dueDate}
                        onChange={(event) => updateTask(task.id, { dueDate: event.target.value })}
                        aria-label={`${index + 1}번째 업무 데드라인`}
                        className="glass-input rounded-lg px-3 py-2 text-xs outline-none"
                      />
                      <button type="button" onClick={() => updateTask(task.id, { dueDate: "" })} className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600">
                        마감 없음
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addTask}
          disabled={tasks.length >= MAX_TASKS}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-200 py-2.5 text-sm font-bold text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={16} />
          업무 추가
        </button>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button type="button" onClick={onClose} disabled={loading} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-40">
            나중에 작성
          </button>
          <button
            type="submit"
            disabled={loading || tasks.some((task) => !task.title.trim())}
            className="flex-1 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 hover:from-brand-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "등록 중..." : `${tasks.length}개 업무 등록`}
          </button>
        </div>
      </form>
    </ModalContainer>
  );
}
