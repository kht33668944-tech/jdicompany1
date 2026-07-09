"use client";

import { CaretDown, CaretRight } from "phosphor-react";
import { useState } from "react";
import type { Profile } from "@/lib/attendance/types";
import type { TaskStatus, TaskWithDetails } from "@/lib/tasks/types";
import { TASK_STATUS_CONFIG } from "@/lib/tasks/constants";
import { formatDueDate } from "@/lib/tasks/utils";
import ListRow from "./ListRow";
import UserAvatar from "@/components/shared/UserAvatar";

interface Props {
  groupedTasks: { key: string; label: string; tasks: TaskWithDetails[] }[];
  onTaskClick: (taskId: string) => void;
  profiles: Profile[];
  onRefresh?: () => void;
}

function MobileTaskCard({
  task,
  onTaskClick,
}: {
  task: TaskWithDetails;
  onTaskClick: (taskId: string) => void;
}) {
  const statusConfig = TASK_STATUS_CONFIG[task.status];
  const dueInfo = formatDueDate(task.due_date, task.status);

  return (
    <button
      onClick={() => onTaskClick(task.id)}
      className="w-full px-4 py-4 text-left transition-colors hover:bg-slate-50"
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${statusConfig.dot}`} />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-bold ${task.status === "완료" ? "text-slate-400 line-through" : "text-slate-700"}`}>
            {task.title}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-lg px-2 py-1 text-[11px] font-bold ${statusConfig.bg} ${statusConfig.text}`}>
              {task.status}
            </span>
            <span className={`text-xs font-bold ${dueInfo.className}`}>{dueInfo.text}</span>
            {task.assignees.length > 0 && (
              <div className="flex -space-x-1.5">
                {task.assignees.slice(0, 2).map((assignee) => (
                  <UserAvatar
                    key={assignee.user_id}
                    name={assignee.full_name}
                    avatarUrl={assignee.avatar_url}
                    size="xs"
                    className="border border-white"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function ListView({ groupedTasks, onTaskClick, profiles, onRefresh }: Props) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(["완료"]));

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {groupedTasks.map((group) => {
        const isCollapsed = collapsedGroups.has(group.key);
        const statusConfig = TASK_STATUS_CONFIG[group.key as TaskStatus];

        return (
          <div key={group.key} className="space-y-3">
            <button
              onClick={() => toggleGroup(group.key)}
              className="flex items-center gap-2 px-2 text-sm font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-600"
            >
              {isCollapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
              {statusConfig && <span className={`h-2.5 w-2.5 rounded-full ${statusConfig.dot}`} />}
              <span>{group.label}</span>
              <span className="ml-1 text-slate-300">{group.tasks.length}</span>
            </button>

            {!isCollapsed && (
              <div className="rounded-3xl bg-white shadow-sm">
                <table className="hidden w-full border-collapse text-left md:table">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="px-4 py-3 text-xs font-bold uppercase text-slate-400">할 일명</th>
                      <th className="w-24 px-4 py-3 text-xs font-bold uppercase text-slate-400">상태</th>
                      <th className="w-28 px-4 py-3 text-xs font-bold uppercase text-slate-400">담당자</th>
                      <th className="w-36 px-4 py-3 text-xs font-bold uppercase text-slate-400">데드라인</th>
                      <th className="w-36 px-4 py-3 text-xs font-bold uppercase text-slate-400">진행률</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {group.tasks.map((task) => (
                      <ListRow
                        key={task.id}
                        task={task}
                        onTaskClick={onTaskClick}
                        profiles={profiles}
                        onRefresh={onRefresh}
                      />
                    ))}
                  </tbody>
                </table>

                <div className="divide-y divide-slate-50 md:hidden">
                  {group.tasks.map((task) => (
                    <MobileTaskCard key={task.id} task={task} onTaskClick={onTaskClick} />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {groupedTasks.length === 0 && (
        <div className="rounded-3xl bg-white p-6 text-center text-slate-400 shadow-sm md:p-12">
          할 일이 없습니다
        </div>
      )}
    </div>
  );
}
