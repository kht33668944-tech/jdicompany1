"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  CircleDashed,
  Circle,
  CheckCircle,
  CaretDown,
  CaretRight,
  ArrowBendDownRight,
  DotsThree,
  Check,
  Trash,
} from "phosphor-react";
import type { IconProps } from "phosphor-react";
import type { TaskWithDetails, TaskStatus, TaskPriority } from "@/lib/tasks/types";
import type { Profile } from "@/lib/attendance/types";
import { TASK_STATUS_CONFIG, PRIORITY_CONFIG, TASK_PRIORITIES, CATEGORIES } from "@/lib/tasks/constants";
import { formatDueDate } from "@/lib/tasks/utils";
import { updateTask, deleteTask, addAssignee, removeAssignee } from "@/lib/tasks/actions";
import ListRow from "./ListRow";
import UserAvatar from "@/components/shared/UserAvatar";

interface Props {
  groupedTasks: { key: string; label: string; tasks: TaskWithDetails[] }[];
  allTasks: TaskWithDetails[];
  onTaskClick: (taskId: string) => void;
  profiles: Profile[];
  userId: string;
}

const STATUS_ICONS: Record<TaskStatus, React.ComponentType<IconProps>> = {
  "대기": Circle,
  "진행중": CircleDashed,
  "완료": CheckCircle,
};

/* ─── Mobile Edit Sheet ─── */
function MobileEditSheet({
  task,
  profiles,
  userId,
  onClose,
}: {
  task: TaskWithDetails;
  profiles: Profile[];
  userId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [localAssigneeIds, setLocalAssigneeIds] = useState(
    () => new Set(task.assignees.map((a) => a.user_id))
  );

  useEffect(() => { sheetRef.current?.focus(); }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);

  const handlePriority = async (priority: TaskPriority) => {
    try {
      await updateTask(task.id, userId, { priority });
      router.refresh();
    } catch (error) {
      console.error("우선순위 변경 실패:", error);
    }
  };

  const handleCategory = async (category: string | null) => {
    try {
      await updateTask(task.id, userId, { category });
      router.refresh();
    } catch (error) {
      console.error("카테고리 변경 실패:", error);
    }
  };

  const handleDueDate = async (date: string | null) => {
    try {
      await updateTask(task.id, userId, { dueDate: date });
      router.refresh();
    } catch (error) {
      console.error("마감일 변경 실패:", error);
    }
  };

  const handleToggleAssignee = async (assigneeId: string) => {
    const isAssigned = localAssigneeIds.has(assigneeId);
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
      setLocalAssigneeIds(new Set(task.assignees.map((a) => a.user_id)));
    }
  };

  const handleDelete = async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteTask(task.id);
      router.refresh();
      onClose();
    } catch (error) {
      console.error("삭제 실패:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div ref={sheetRef} tabIndex={-1} className="relative w-full bg-white rounded-t-3xl p-6 pb-8 max-h-[80vh] overflow-y-auto outline-none">
        {/* Handle */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
        <h4 className="font-bold text-slate-700 truncate mb-5">{task.title}</h4>

        {/* 우선순위 */}
        <div className="mb-5">
          <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">우선순위</label>
          <div className="flex gap-2">
            {TASK_PRIORITIES.map((p) => {
              const pc = PRIORITY_CONFIG[p];
              const isActive = task.priority === p;
              return (
                <button
                  key={p}
                  onClick={() => handlePriority(p)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${pc.bg} ${pc.text} ${
                    isActive ? "ring-2 ring-indigo-400 ring-offset-1" : ""
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        {/* 카테고리 */}
        <div className="mb-5">
          <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">카테고리</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleCategory(null)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                !task.category
                  ? "bg-indigo-100 text-indigo-600 ring-2 ring-indigo-400 ring-offset-1"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              없음
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => handleCategory(c)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  task.category === c
                    ? "bg-indigo-100 text-indigo-600 ring-2 ring-indigo-400 ring-offset-1"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* 마감일 */}
        <div className="mb-5">
          <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">마감일</label>
          <input
            type="date"
            defaultValue={task.due_date ?? ""}
            onChange={(e) => handleDueDate(e.target.value || null)}
            className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
          />
        </div>

        {/* 담당자 */}
        <div className="mb-6">
          <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">담당자</label>
          <div className="space-y-1">
            {profiles.map((p) => {
              const isAssigned = localAssigneeIds.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => handleToggleAssignee(p.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                    isAssigned ? "bg-indigo-50" : "hover:bg-slate-50"
                  }`}
                >
                  <UserAvatar name={p.full_name} avatarUrl={p.avatar_url} size="sm" />
                  <span className="flex-1 text-left text-slate-600 font-medium">{p.full_name}</span>
                  {isAssigned && <Check size={16} className="text-indigo-600" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 삭제 */}
        <button
          onClick={handleDelete}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-all"
        >
          <Trash size={16} />
          삭제
        </button>
      </div>
    </div>
  );
}

/* ─── Mobile Task Card ─── */
function MobileTaskCard({
  task,
  subtasks,
  onTaskClick,
  isSubtask,
  profiles,
  userId,
}: {
  task: TaskWithDetails;
  subtasks?: TaskWithDetails[];
  onTaskClick: (taskId: string) => void;
  isSubtask: boolean;
  profiles: Profile[];
  userId: string;
}) {
  const [showSheet, setShowSheet] = useState(false);
  const StatusIcon = STATUS_ICONS[task.status];
  const statusColor =
    task.status === "진행중" ? "text-orange-500" : task.status === "완료" ? "text-emerald-500" : "text-slate-300";
  const priorityConfig = PRIORITY_CONFIG[task.priority];
  const dueInfo = formatDueDate(task.due_date, task.status);

  return (
    <>
      <div className="relative">
        <button
          onClick={() => onTaskClick(task.id)}
          className={`w-full text-left p-4 ${!isSubtask ? "pr-10" : ""} hover:bg-slate-50 transition-colors ${
            isSubtask ? "pl-10" : ""
          }`}
        >
          {/* Top: status icon + title + priority */}
          <div className="flex items-start gap-2">
            {isSubtask && <ArrowBendDownRight size={14} className="text-slate-300 mt-0.5 flex-shrink-0" />}
            <StatusIcon size={16} className={`${statusColor} mt-0.5 flex-shrink-0`} />
            <span
              className={`font-semibold text-sm flex-1 ${
                task.status === "완료" ? "line-through text-slate-400" : "text-slate-700"
              }`}
            >
              {task.title}
            </span>
            <span
              className={`px-1.5 py-0.5 ${priorityConfig.bg} ${priorityConfig.text} text-[10px] font-bold rounded border ${priorityConfig.border} flex-shrink-0`}
            >
              {task.priority}
            </span>
          </div>

          {/* Bottom: meta row */}
          <div className="flex items-center gap-3 mt-2 ml-6">
            {task.category && (
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded">
                {task.category}
              </span>
            )}
            {task.assignees.length > 0 && (
              <div className="flex -space-x-1.5">
                {task.assignees.slice(0, 2).map((a) => (
                  <UserAvatar
                    key={a.user_id}
                    name={a.full_name}
                    avatarUrl={a.avatar_url}
                    size="xs"
                    className="border border-white"
                  />
                ))}
                {task.assignees.length > 2 && (
                  <div className="w-5 h-5 rounded-full bg-slate-100 border border-white flex items-center justify-center text-[8px] font-bold text-slate-400">
                    +{task.assignees.length - 2}
                  </div>
                )}
              </div>
            )}
            {dueInfo.text && <span className={`text-[11px] ${dueInfo.className}`}>{dueInfo.text}</span>}
            {task.checklist_total > 0 && (
              <span className="text-[11px] text-slate-400 font-medium">
                {task.checklist_completed}/{task.checklist_total}
              </span>
            )}
          </div>
        </button>

        {/* More button */}
        {!isSubtask && (
          <button
            onClick={() => setShowSheet(true)}
            className="absolute top-4 right-3 p-1 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <DotsThree size={20} weight="bold" />
          </button>
        )}
      </div>

      {showSheet && (
        <MobileEditSheet
          task={task}
          profiles={profiles}
          userId={userId}
          onClose={() => setShowSheet(false)}
        />
      )}

      {subtasks?.map((child) => (
        <MobileTaskCard
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

/* ─── List View ─── */
export default function ListView({ groupedTasks, allTasks, onTaskClick, profiles, userId }: Props) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(["완료"]));

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const childrenMap = useMemo(() => {
    const map = new Map<string, TaskWithDetails[]>();
    for (const task of allTasks) {
      if (task.children && task.children.length > 0) {
        map.set(task.id, task.children);
      }
    }
    return map;
  }, [allTasks]);

  return (
    <div className="space-y-6">
      {groupedTasks.map((group) => {
        const isCollapsed = collapsedGroups.has(group.key);
        const statusConfig = TASK_STATUS_CONFIG[group.key as TaskStatus];
        const StatusIcon = STATUS_ICONS[group.key as TaskStatus];

        return (
          <div key={group.key} className="space-y-3">
            {/* 그룹 헤더 */}
            <button
              onClick={() => toggleGroup(group.key)}
              className="flex items-center gap-2 px-2 text-slate-400 font-bold text-sm uppercase tracking-wider hover:text-slate-600 transition-colors"
            >
              {isCollapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
              {StatusIcon && (
                <StatusIcon
                  size={16}
                  className={statusConfig?.dot.replace("bg-", "text-") ?? "text-slate-400"}
                />
              )}
              <span>{group.label}</span>
              <span className="ml-1 text-slate-300">{group.tasks.length}</span>
            </button>

            {/* 그룹 테이블 */}
            {!isCollapsed && (
              <div className="bg-white rounded-3xl shadow-sm">
                {/* Desktop table */}
                <table className="w-full text-left border-collapse hidden md:table">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">할일명</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase w-24">우선순위</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase w-28">카테고리</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase w-28">담당자</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase w-28">마감일</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase w-36">진행률</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {group.tasks.map((task) => (
                      <ListRow
                        key={task.id}
                        task={task}
                        subtasks={childrenMap.get(task.id)}
                        onTaskClick={onTaskClick}
                        isSubtask={false}
                        profiles={profiles}
                        userId={userId}
                      />
                    ))}
                  </tbody>
                </table>

                {/* Mobile card layout */}
                <div className="md:hidden divide-y divide-slate-50">
                  {group.tasks.map((task) => (
                    <MobileTaskCard
                      key={task.id}
                      task={task}
                      subtasks={childrenMap.get(task.id)}
                      onTaskClick={onTaskClick}
                      isSubtask={false}
                      profiles={profiles}
                      userId={userId}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {groupedTasks.length === 0 && (
        <div className="bg-white rounded-3xl shadow-sm p-6 md:p-12 text-center text-slate-400">
          할일이 없습니다
        </div>
      )}
    </div>
  );
}
