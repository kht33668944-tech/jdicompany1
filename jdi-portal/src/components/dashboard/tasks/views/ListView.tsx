"use client";

import { useState } from "react";
import {
  CircleDashed,
  Circle,
  CheckCircle,
  CaretDown,
  CaretRight,
} from "phosphor-react";
import type { IconProps } from "phosphor-react";
import type { TaskWithDetails, TaskStatus } from "@/lib/tasks/types";
import { TASK_STATUS_CONFIG } from "@/lib/tasks/constants";
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

  // 서브태스크 매핑: parent_id → children
  const childrenMap = new Map<string, TaskWithDetails[]>();
  for (const task of allTasks) {
    if (task.children && task.children.length > 0) {
      childrenMap.set(task.id, task.children);
    }
  }

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
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                        할일명
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase w-24">
                        우선순위
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase w-32">
                        카테고리
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase w-28">
                        담당자
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase w-32">
                        마감일
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase w-40">
                        진행률
                      </th>
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
              </div>
            )}
          </div>
        );
      })}

      {groupedTasks.length === 0 && (
        <div className="bg-white rounded-3xl shadow-sm p-12 text-center text-slate-400">
          할일이 없습니다
        </div>
      )}
    </div>
  );
}
