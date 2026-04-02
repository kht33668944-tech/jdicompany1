"use client";

import { useState, useMemo } from "react";
import {
  CircleDashed,
  Circle,
  CheckCircle,
  CaretDown,
  CaretRight,
  ArrowBendDownRight,
} from "phosphor-react";
import type { IconProps } from "phosphor-react";
import type { TaskWithDetails, TaskStatus } from "@/lib/tasks/types";
import { TASK_STATUS_CONFIG, PRIORITY_CONFIG } from "@/lib/tasks/constants";
import { formatDueDate } from "@/lib/tasks/utils";
import ListRow from "./ListRow";

interface Props {
  groupedTasks: { key: string; label: string; tasks: TaskWithDetails[] }[];
  allTasks: TaskWithDetails[];
  onTaskClick: (taskId: string) => void;
}

const STATUS_ICONS: Record<TaskStatus, React.ComponentType<IconProps>> = {
  "대기": Circle,
  "진행중": CircleDashed,
  "완료": CheckCircle,
};

function MobileTaskCard({
  task,
  children,
  onTaskClick,
  isSubtask,
}: {
  task: TaskWithDetails;
  children?: TaskWithDetails[];
  onTaskClick: (taskId: string) => void;
  isSubtask: boolean;
}) {
  const StatusIcon = STATUS_ICONS[task.status];
  const statusColor = task.status === "진행중" ? "text-orange-500" : task.status === "완료" ? "text-emerald-500" : "text-slate-300";
  const priorityConfig = PRIORITY_CONFIG[task.priority];
  const dueInfo = formatDueDate(task.due_date, task.status);

  return (
    <>
      <button
        onClick={() => onTaskClick(task.id)}
        className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${isSubtask ? "pl-10" : ""}`}
      >
        {/* Top: status icon + title + priority */}
        <div className="flex items-start gap-2">
          {isSubtask && <ArrowBendDownRight size={14} className="text-slate-300 mt-0.5 flex-shrink-0" />}
          <StatusIcon size={16} className={`${statusColor} mt-0.5 flex-shrink-0`} />
          <span className={`font-semibold text-sm flex-1 ${task.status === "완료" ? "line-through text-slate-400" : "text-slate-700"}`}>
            {task.title}
          </span>
          <span className={`px-1.5 py-0.5 ${priorityConfig.bg} ${priorityConfig.text} text-[10px] font-bold rounded border ${priorityConfig.border} flex-shrink-0`}>
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
                <div key={a.user_id} className="w-5 h-5 rounded-full bg-indigo-100 border border-white flex items-center justify-center text-[8px] font-bold text-indigo-600">
                  {a.full_name.charAt(0)}
                </div>
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
            <span className="text-[11px] text-slate-400 font-medium">{task.checklist_completed}/{task.checklist_total}</span>
          )}
        </div>
      </button>

      {children?.map((child) => (
        <MobileTaskCard key={child.id} task={child} onTaskClick={onTaskClick} isSubtask={true} />
      ))}
    </>
  );
}

export default function ListView({ groupedTasks, allTasks, onTaskClick }: Props) {
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
              <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
                {/* Desktop table - hidden on mobile */}
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
                        children={childrenMap.get(task.id)}
                        onTaskClick={onTaskClick}
                        isSubtask={false}
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
                      children={childrenMap.get(task.id)}
                      onTaskClick={onTaskClick}
                      isSubtask={false}
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
