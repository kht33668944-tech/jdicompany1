"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  CircleDashed,
  Circle,
  CheckCircle,
  ArrowBendDownRight,
  ChatCircleDots,
  Trash,
  Check,
} from "phosphor-react";
import type { TaskWithDetails, TaskStatus, TaskPriority } from "@/lib/tasks/types";
import type { Profile } from "@/lib/attendance/types";
import { PRIORITY_CONFIG, TASK_PRIORITIES, CATEGORIES } from "@/lib/tasks/constants";
import { formatDueDate, calculateProgress } from "@/lib/tasks/utils";
import { updateTask, deleteTask, addAssignee, removeAssignee } from "@/lib/tasks/actions";
import UserAvatar from "@/components/shared/UserAvatar";

interface Props {
  task: TaskWithDetails;
  subtasks?: TaskWithDetails[];
  onTaskClick: (taskId: string) => void;
  isSubtask: boolean;
  profiles: Profile[];
  userId: string;
}

const STATUS_ICONS: Record<TaskStatus, React.ComponentType<{ size?: number; className?: string }>> = {
  "대기": Circle,
  "진행중": CircleDashed,
  "완료": CheckCircle,
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  "대기": "text-slate-300",
  "진행중": "text-orange-500",
  "완료": "text-emerald-500",
};

type EditingField = "priority" | "category" | "assignee" | "dueDate" | null;

export default function ListRow({ task, subtasks, onTaskClick, isSubtask, profiles, userId }: Props) {
  const router = useRouter();
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [localAssigneeIds, setLocalAssigneeIds] = useState(() => new Set(task.assignees.map((a) => a.user_id)));
  const dropdownRef = useRef<HTMLDivElement>(null);

  const StatusIcon = STATUS_ICONS[task.status];
  const priorityConfig = PRIORITY_CONFIG[task.priority];
  const dueInfo = formatDueDate(task.due_date, task.status);
  const progress = calculateProgress(task.checklist_total, task.checklist_completed);
  const progressBarColor =
    progress === 100 ? "bg-emerald-500" : task.status === "진행중" ? "bg-indigo-500" : "bg-indigo-300";

  // Sync local assignees when task prop updates (after router.refresh)
  useEffect(() => {
    setLocalAssigneeIds(new Set(task.assignees.map((a) => a.user_id)));
  }, [task.assignees]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!editingField) return;
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEditingField(null);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [editingField]);

  const handlePriorityChange = async (priority: TaskPriority) => {
    setEditingField(null);
    try {
      await updateTask(task.id, userId, { priority });
      router.refresh();
    } catch (error) {
      console.error("우선순위 변경 실패:", error);
    }
  };

  const handleCategoryChange = async (category: string | null) => {
    setEditingField(null);
    try {
      await updateTask(task.id, userId, { category });
      router.refresh();
    } catch (error) {
      console.error("카테고리 변경 실패:", error);
    }
  };

  const handleDueDateChange = async (dueDate: string | null) => {
    setEditingField(null);
    try {
      await updateTask(task.id, userId, { dueDate });
      router.refresh();
    } catch (error) {
      console.error("마감일 변경 실패:", error);
    }
  };

  const handleToggleAssignee = async (assigneeId: string) => {
    const isAssigned = localAssigneeIds.has(assigneeId);
    // Optimistic update
    setLocalAssigneeIds((prev) => {
      const next = new Set(prev);
      if (isAssigned) next.delete(assigneeId);
      else next.add(assigneeId);
      return next;
    });
    try {
      if (isAssigned) {
        await removeAssignee(task.id, assigneeId, userId);
      } else {
        await addAssignee(task.id, assigneeId, userId);
      }
      router.refresh();
    } catch (error) {
      console.error("담당자 변경 실패:", error);
      // Revert optimistic update
      setLocalAssigneeIds(new Set(task.assignees.map((a) => a.user_id)));
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteTask(task.id);
      router.refresh();
    } catch (error) {
      console.error("삭제 실패:", error);
    }
  };

  const openField = (field: EditingField) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingField(editingField === field ? null : field);
  };

  return (
    <>
      <tr
        onClick={() => onTaskClick(task.id)}
        className="hover:bg-slate-50 transition-all cursor-pointer group"
      >
        {/* 할일명 */}
        <td className={`px-4 py-3 ${isSubtask ? "pl-10" : ""}`}>
          <div className="flex items-center gap-3">
            {isSubtask && <ArrowBendDownRight size={16} className="text-slate-300" />}
            <StatusIcon size={18} className={STATUS_COLORS[task.status]} />
            <span
              className={`font-semibold ${
                isSubtask ? "text-slate-500 font-medium" : "text-slate-700"
              } ${task.status === "완료" ? "line-through text-slate-400" : ""}`}
            >
              {task.title}
            </span>
            {task.comment_count > 0 && (
              <div className="flex items-center gap-1 text-slate-300 ml-2">
                <ChatCircleDots size={14} />
                <span className="text-xs">{task.comment_count}</span>
              </div>
            )}
          </div>
        </td>

        {/* 우선순위 — 인라인 수정 */}
        <td className="px-4 py-3 relative">
          <div onClick={openField("priority")} title="클릭하여 수정">
            <span
              className={`px-2 py-1 ${priorityConfig.bg} ${priorityConfig.text} text-[11px] font-bold rounded-md border ${priorityConfig.border} uppercase cursor-pointer hover:ring-2 hover:ring-indigo-200 transition-all`}
            >
              {task.priority}
            </span>
          </div>
          {editingField === "priority" && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-2 mt-1 z-30 bg-white rounded-xl shadow-lg border border-slate-100 py-1 min-w-[120px]"
            >
              {TASK_PRIORITIES.map((p) => {
                const pc = PRIORITY_CONFIG[p];
                return (
                  <button
                    key={p}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePriorityChange(p);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 ${
                      task.priority === p ? "bg-slate-50" : ""
                    }`}
                  >
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${pc.bg} ${pc.text}`}>
                      {p}
                    </span>
                    {task.priority === p && <Check size={14} className="text-indigo-600 ml-auto" />}
                  </button>
                );
              })}
            </div>
          )}
        </td>

        {/* 카테고리 — 인라인 수정 */}
        <td className="px-4 py-3 relative">
          <div onClick={openField("category")} title="클릭하여 수정">
            {task.category ? (
              <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[11px] font-bold rounded-md uppercase cursor-pointer hover:ring-2 hover:ring-indigo-200 transition-all">
                {task.category}
              </span>
            ) : (
              <span className="text-xs text-slate-300 cursor-pointer hover:text-slate-400 transition-colors">
                —
              </span>
            )}
          </div>
          {editingField === "category" && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-2 mt-1 z-30 bg-white rounded-xl shadow-lg border border-slate-100 py-1 min-w-[120px]"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCategoryChange(null);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 text-slate-400 ${
                  !task.category ? "bg-slate-50" : ""
                }`}
              >
                없음
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCategoryChange(c);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center ${
                    task.category === c ? "bg-slate-50" : ""
                  }`}
                >
                  <span>{c}</span>
                  {task.category === c && <Check size={14} className="text-indigo-600 ml-auto" />}
                </button>
              ))}
            </div>
          )}
        </td>

        {/* 담당자 — 인라인 수정 */}
        <td className="px-4 py-3 relative">
          <div
            className="flex -space-x-2 cursor-pointer"
            onClick={openField("assignee")}
            title="클릭하여 수정"
          >
            {task.assignees.length > 0 ? (
              <>
                {task.assignees.slice(0, 3).map((assignee) => (
                  <UserAvatar
                    key={assignee.user_id}
                    name={assignee.full_name}
                    avatarUrl={assignee.avatar_url}
                    size="sm"
                    className="border-2 border-white hover:ring-2 hover:ring-indigo-200 transition-all"
                  />
                ))}
                {task.assignees.length > 3 && (
                  <div className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-400">
                    +{task.assignees.length - 3}
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-300 hover:text-slate-400 transition-colors">—</span>
            )}
          </div>
          {editingField === "assignee" && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-2 mt-1 z-30 bg-white rounded-xl shadow-lg border border-slate-100 py-1 min-w-[200px] max-h-[240px] overflow-y-auto"
            >
              {profiles.map((p) => {
                const isAssigned = localAssigneeIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleAssignee(p.id);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${
                      isAssigned ? "bg-indigo-50/50" : ""
                    }`}
                  >
                    <UserAvatar name={p.full_name} avatarUrl={p.avatar_url} size="xs" />
                    <span className="flex-1 text-left text-slate-600">{p.full_name}</span>
                    {isAssigned && <Check size={14} className="text-indigo-600" />}
                  </button>
                );
              })}
            </div>
          )}
        </td>

        {/* 마감일 — 인라인 수정 */}
        <td className="px-4 py-3 relative">
          {editingField === "dueDate" ? (
            <div ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
              <input
                type="date"
                defaultValue={task.due_date ?? ""}
                onChange={(e) => handleDueDateChange(e.target.value || null)}
                className="glass-input px-2 py-1 rounded-lg text-sm outline-none w-full"
                autoFocus
              />
            </div>
          ) : (
            <span
              onClick={openField("dueDate")}
              className={`text-sm ${dueInfo.className} cursor-pointer hover:underline transition-colors`}
              title="클릭하여 수정"
            >
              {dueInfo.text || "—"}
            </span>
          )}
        </td>

        {/* 진행률 + 삭제 */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              {task.checklist_total > 0 ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`${progressBarColor} h-full rounded-full transition-all`}
                      style={{ width: `${progress}%` }}
                    />
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
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all shrink-0"
              title="삭제"
            >
              <Trash size={14} />
            </button>
          </div>
        </td>
      </tr>

      {subtasks?.map((child) => (
        <ListRow
          key={child.id}
          task={child}
          onTaskClick={onTaskClick}
          isSubtask={true}
          profiles={profiles}
          userId={userId}
        />
      ))}
    </>
  );
}
