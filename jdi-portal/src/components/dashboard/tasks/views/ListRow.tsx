"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckSquare, Plus, Square, Trash } from "phosphor-react";
import type { Profile } from "@/lib/attendance/types";
import type { TaskChecklistItem, TaskStatus, TaskWithDetails } from "@/lib/tasks/types";
import { TASK_STATUSES, TASK_STATUS_CONFIG } from "@/lib/tasks/constants";
import { calculateProgress, formatDueDate } from "@/lib/tasks/utils";
import {
  addAssignee,
  addChecklistItem,
  deleteChecklistItem,
  deleteTask,
  removeAssignee,
  updateChecklistItem,
  updateTask,
} from "@/lib/tasks/actions";
import { getChecklistItems } from "@/lib/tasks/queries";
import { createClient } from "@/lib/supabase/client";
import UserAvatar from "@/components/shared/UserAvatar";

interface Props {
  task: TaskWithDetails;
  onTaskClick: (taskId: string) => void;
  profiles: Profile[];
  onRefresh?: () => void;
}

type EditingField = "status" | "assignee" | "period" | null;

function formatDeadline(dueDate: string | null | undefined): string {
  if (!dueDate) return "-";
  const [, month, day] = dueDate.split("-");
  return `${month}.${day}`;
}

export default function ListRow({ task, onTaskClick, profiles, onRefresh }: Props) {
  const router = useRouter();
  const refresh = () => {
    if (onRefresh) onRefresh();
    else router.refresh();
  };
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistItems, setChecklistItems] = useState<TaskChecklistItem[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const serverAssigneeIds = useMemo(
    () => new Set(task.assignees.map((assignee) => assignee.user_id)),
    [task.assignees]
  );
  const [optimisticOverride, setOptimisticOverride] = useState<Set<string> | null>(null);
  const localAssigneeIds = optimisticOverride ?? serverAssigneeIds;
  const statusConfig = TASK_STATUS_CONFIG[task.status];
  const dueInfo = formatDueDate(task.due_date, task.status);
  const progress = calculateProgress(task.checklist_total, task.checklist_completed);
  const progressBarColor = progress === 100 ? "bg-emerald-500" : "bg-indigo-500";
  const [localDueDate, setLocalDueDate] = useState(task.due_date ?? "");

  useEffect(() => {
    setLocalDueDate(task.due_date ?? "");
  }, [task.due_date]);

  useEffect(() => {
    if (!editingField) return;
    const handle = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setEditingField(null);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [editingField]);

  const fetchChecklist = async () => {
    setChecklistLoading(true);
    try {
      const supabase = createClient();
      const items = await getChecklistItems(supabase, task.id);
      setChecklistItems(items);
    } catch (error) {
      console.error("체크리스트 로드 실패:", error);
    } finally {
      setChecklistLoading(false);
    }
  };

  const handleToggleChecklist = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!checklistOpen) {
      setChecklistOpen(true);
      fetchChecklist();
    } else {
      setChecklistOpen(false);
    }
  };

  const handleChecklistToggleItem = async (item: TaskChecklistItem) => {
    setChecklistItems((prev) =>
      prev.map((current) => (current.id === item.id ? { ...current, is_completed: !current.is_completed } : current))
    );
    try {
      await updateChecklistItem(item.id, { is_completed: !item.is_completed });
      refresh();
    } catch (error) {
      console.error("체크리스트 변경 실패:", error);
      setChecklistItems((prev) =>
        prev.map((current) => (current.id === item.id ? { ...current, is_completed: item.is_completed } : current))
      );
    }
  };

  const handleChecklistDeleteItem = async (itemId: string) => {
    setChecklistItems((prev) => prev.filter((item) => item.id !== itemId));
    try {
      await deleteChecklistItem(itemId);
      refresh();
    } catch (error) {
      console.error("체크리스트 삭제 실패:", error);
      fetchChecklist();
    }
  };

  const handleChecklistAddItem = async () => {
    if (!newChecklistItem.trim()) return;
    try {
      const added = await addChecklistItem(task.id, newChecklistItem.trim());
      setChecklistItems((prev) => [...prev, added]);
      setNewChecklistItem("");
      refresh();
    } catch (error) {
      console.error("체크리스트 추가 실패:", error);
    }
  };

  const handleStatusChange = async (status: TaskStatus) => {
    setEditingField(null);
    if (status === task.status) return;
    try {
      await updateTask(task.id, { status });
      refresh();
    } catch (error) {
      console.error("상태 변경 실패:", error);
    }
  };

  const handleDueDateChange = async (value: string) => {
    setLocalDueDate(value);
    try {
      await updateTask(task.id, { dueDate: value || null });
      refresh();
    } catch (error) {
      console.error("마감일 변경 실패:", error);
      setLocalDueDate(task.due_date ?? "");
    }
  };

  const handleToggleAssignee = async (assigneeId: string) => {
    const isAssigned = localAssigneeIds.has(assigneeId);
    const next = new Set(localAssigneeIds);
    if (isAssigned) next.delete(assigneeId);
    else next.add(assigneeId);
    setOptimisticOverride(next);
    try {
      if (isAssigned) await removeAssignee(task.id, assigneeId);
      else await addAssignee(task.id, assigneeId);
      refresh();
      setOptimisticOverride(null);
    } catch (error) {
      console.error("담당자 변경 실패:", error);
      setOptimisticOverride(null);
    }
  };

  const handleDelete = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteTask(task.id);
      refresh();
    } catch (error) {
      console.error("삭제 실패:", error);
    }
  };

  const openField = (field: EditingField) => (event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingField(editingField === field ? null : field);
  };

  return (
    <>
      <tr onClick={() => onTaskClick(task.id)} className="group cursor-pointer transition-all hover:bg-slate-50">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleChecklist}
              className={`relative shrink-0 rounded-md p-0.5 transition-all ${
                checklistOpen ? "bg-indigo-50 ring-2 ring-indigo-200" : "hover:bg-slate-100"
              }`}
              title={task.checklist_total > 0 ? "체크리스트 펼치기" : "체크리스트"}
            >
              <span className={`block h-4 w-4 rounded-full ${statusConfig.dot}`} />
              {task.checklist_total > 0 && (
                <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-indigo-500 text-[7px] font-bold text-white">
                  {task.checklist_total}
                </span>
              )}
            </button>
            <span className={`font-semibold ${task.status === "완료" ? "text-slate-400 line-through" : "text-slate-700"}`}>
              {task.title}
            </span>
          </div>
        </td>

        <td className="relative px-4 py-3">
          <div onClick={openField("status")} title="클릭하여 수정">
            <span className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold transition-all hover:ring-2 hover:ring-indigo-200 ${statusConfig.bg} ${statusConfig.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dot}`} />
              {task.status}
            </span>
          </div>
          {editingField === "status" && (
            <div
              ref={dropdownRef}
              className="absolute left-2 top-full z-30 mt-1 min-w-[120px] rounded-xl border border-slate-100 bg-white py-1 shadow-lg"
            >
              {TASK_STATUSES.map((status) => {
                const config = TASK_STATUS_CONFIG[status];
                return (
                  <button
                    key={status}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleStatusChange(status);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      task.status === status ? "bg-slate-50" : ""
                    }`}
                  >
                    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold ${config.bg} ${config.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
                      {status}
                    </span>
                    {task.status === status && <Check size={14} className="ml-auto text-indigo-600" />}
                  </button>
                );
              })}
            </div>
          )}
        </td>

        <td className="relative px-4 py-3">
          <div className="flex cursor-pointer -space-x-2" onClick={openField("assignee")} title="클릭하여 수정">
            {task.assignees.length > 0 ? (
              <>
                {task.assignees.slice(0, 3).map((assignee) => (
                  <UserAvatar
                    key={assignee.user_id}
                    name={assignee.full_name}
                    avatarUrl={assignee.avatar_url}
                    size="sm"
                    className="border-2 border-white transition-all hover:ring-2 hover:ring-indigo-200"
                  />
                ))}
                {task.assignees.length > 3 && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[10px] font-bold text-slate-400">
                    +{task.assignees.length - 3}
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-300 transition-colors hover:text-slate-400">-</span>
            )}
          </div>
          {editingField === "assignee" && (
            <div
              ref={dropdownRef}
              className="absolute left-2 top-full z-30 mt-1 max-h-[240px] min-w-[200px] overflow-y-auto rounded-xl border border-slate-100 bg-white py-1 shadow-lg"
            >
              {profiles.map((profile) => {
                const isAssigned = localAssigneeIds.has(profile.id);
                return (
                  <button
                    key={profile.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleToggleAssignee(profile.id);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${
                      isAssigned ? "bg-indigo-50/50" : ""
                    }`}
                  >
                    <UserAvatar name={profile.full_name} avatarUrl={profile.avatar_url} size="xs" />
                    <span className="flex-1 text-left text-slate-600">{profile.full_name}</span>
                    {isAssigned && <Check size={14} className="text-indigo-600" />}
                  </button>
                );
              })}
            </div>
          )}
        </td>

        <td className="relative px-4 py-3">
          <span
            onClick={openField("period")}
            className={`cursor-pointer text-sm transition-colors hover:underline ${dueInfo.className}`}
            title="클릭하여 수정"
          >
            {formatDeadline(localDueDate || null)}
          </span>
          {editingField === "period" && (
            <div
              ref={dropdownRef}
              onClick={(event) => event.stopPropagation()}
              className="absolute right-0 top-full z-30 mt-1 min-w-[220px] rounded-xl border border-slate-100 bg-white p-3 shadow-lg"
            >
              <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">데드라인</label>
              <input
                type="date"
                value={localDueDate}
                onChange={(event) => handleDueDateChange(event.target.value)}
                className="glass-input w-full rounded-lg px-2 py-1 text-sm outline-none"
              />
            </div>
          )}
        </td>

        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              {task.checklist_total > 0 ? (
                <div className="flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className={`${progressBarColor} h-full rounded-full transition-all`} style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    {task.checklist_completed}/{task.checklist_total}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-300">-</span>
              )}
            </div>
            <button
              onClick={handleDelete}
              className="shrink-0 p-1 text-slate-300 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100"
              title="삭제"
            >
              <Trash size={14} />
            </button>
          </div>
        </td>
      </tr>

      {checklistOpen && (
        <tr>
          <td colSpan={5} className="px-0 py-0">
            <div className="mx-4 mb-3 ml-10 mt-1 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              {checklistLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                  불러오는 중...
                </div>
              ) : (
                <>
                  {checklistItems.length > 0 && (
                    <div className="mb-3 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full transition-all ${
                            checklistItems.every((item) => item.is_completed) ? "bg-emerald-500" : "bg-indigo-500"
                          }`}
                          style={{
                            width: `${Math.round((checklistItems.filter((item) => item.is_completed).length / checklistItems.length) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-400">
                        {checklistItems.filter((item) => item.is_completed).length}/{checklistItems.length}
                      </span>
                    </div>
                  )}

                  <div className="space-y-1">
                    {checklistItems.map((item) => (
                      <div key={item.id} className="group/item flex items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-white">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleChecklistToggleItem(item);
                          }}
                          className="shrink-0"
                        >
                          {item.is_completed ? (
                            <CheckSquare size={16} weight="fill" className="text-emerald-500" />
                          ) : (
                            <Square size={16} className="text-slate-300 transition-colors hover:text-indigo-500" />
                          )}
                        </button>
                        <span className={`flex-1 text-sm ${item.is_completed ? "text-slate-400 line-through" : "text-slate-600"}`}>
                          {item.content}
                        </span>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleChecklistDeleteItem(item.id);
                          }}
                          className="text-slate-300 opacity-0 transition-all hover:text-red-500 group-hover/item:opacity-100"
                        >
                          <Trash size={12} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {checklistItems.length === 0 && (
                    <p className="mb-2 text-xs text-slate-400">체크리스트가 비어있습니다.</p>
                  )}

                  <div className="mt-2 flex gap-2">
                    <input
                      value={newChecklistItem}
                      onChange={(event) => setNewChecklistItem(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.stopPropagation();
                          handleChecklistAddItem();
                        }
                      }}
                      onClick={(event) => event.stopPropagation()}
                      placeholder="항목 추가..."
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none transition-all focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200"
                    />
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleChecklistAddItem();
                      }}
                      disabled={!newChecklistItem.trim()}
                      className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-sm font-bold text-white transition-all hover:bg-indigo-500 disabled:opacity-40"
                    >
                      <Plus size={14} weight="bold" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
