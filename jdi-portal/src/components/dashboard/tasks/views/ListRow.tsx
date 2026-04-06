"use client";

import {
  CircleDashed,
  Circle,
  CheckCircle,
  ArrowBendDownRight,
  ChatCircleDots,
} from "phosphor-react";
import type { TaskWithDetails, TaskStatus } from "@/lib/tasks/types";
import { PRIORITY_CONFIG } from "@/lib/tasks/constants";
import { formatDueDate, calculateProgress } from "@/lib/tasks/utils";
import UserAvatar from "@/components/shared/UserAvatar";

interface Props {
  task: TaskWithDetails;
  subtasks?: TaskWithDetails[];
  onTaskClick: (taskId: string) => void;
  isSubtask: boolean;
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

export default function ListRow({ task, subtasks, onTaskClick, isSubtask }: Props) {
  const StatusIcon = STATUS_ICONS[task.status];
  const priorityConfig = PRIORITY_CONFIG[task.priority];
  const dueInfo = formatDueDate(task.due_date, task.status);
  const progress = calculateProgress(task.checklist_total, task.checklist_completed);
  const progressBarColor =
    progress === 100 ? "bg-emerald-500" : task.status === "진행중" ? "bg-indigo-500" : "bg-indigo-300";

  return (
    <>
      <tr
        onClick={() => onTaskClick(task.id)}
        className="hover:bg-slate-50 transition-all cursor-pointer group"
      >
        {/* 할일명 */}
        <td className={`px-4 py-3 ${isSubtask ? "pl-10" : ""}`}>
          <div className="flex items-center gap-3">
            {isSubtask && (
              <ArrowBendDownRight size={16} className="text-slate-300" />
            )}
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

        {/* 우선순위 */}
        <td className="px-4 py-3">
          <span
            className={`px-2 py-1 ${priorityConfig.bg} ${priorityConfig.text} text-[11px] font-bold rounded-md border ${priorityConfig.border} uppercase`}
          >
            {task.priority}
          </span>
        </td>

        {/* 카테고리 */}
        <td className="px-4 py-3">
          {task.category && (
            <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[11px] font-bold rounded-md uppercase">
              {task.category}
            </span>
          )}
        </td>

        {/* 담당자 */}
        <td className="px-4 py-3">
          <div className="flex -space-x-2">
            {task.assignees.slice(0, 3).map((assignee) => (
              <UserAvatar
                key={assignee.user_id}
                name={assignee.full_name}
                avatarUrl={assignee.avatar_url}
                size="sm"
                className="border-2 border-white"
              />
            ))}
            {task.assignees.length > 3 && (
              <div className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-400">
                +{task.assignees.length - 3}
              </div>
            )}
          </div>
        </td>

        {/* 마감일 */}
        <td className="px-4 py-3">
          <span className={`text-sm ${dueInfo.className}`}>{dueInfo.text}</span>
        </td>

        {/* 진행률 */}
        <td className="px-4 py-3">
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
        </td>
      </tr>

      {/* 서브태스크 렌더링 */}
      {subtasks?.map((child) => (
        <ListRow
          key={child.id}
          task={child}
          onTaskClick={onTaskClick}
          isSubtask={true}
        />
      ))}
    </>
  );
}
