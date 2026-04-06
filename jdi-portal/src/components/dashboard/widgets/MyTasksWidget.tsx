"use client";

import Link from "next/link";
import { CheckCircle } from "phosphor-react";
import type { TaskWithDetails } from "@/lib/tasks/types";
import { formatDueDate } from "@/lib/tasks/utils";
import UserAvatar from "@/components/shared/UserAvatar";

interface Props {
  tasks: TaskWithDetails[];
}

export default function MyTasksWidget({ tasks }: Props) {
  const sorted = [...tasks]
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    })
    .slice(0, 5);

  return (
    <div className="bg-white rounded-[24px] shadow-sm p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-slate-800">오늘의 할일</h3>
          <p className="text-xs text-slate-400 mt-1">마감 임박 순으로 정렬됨</p>
        </div>
        <Link
          href="/dashboard/tasks"
          className="text-sm font-bold text-indigo-600 hover:underline"
        >
          전체보기
        </Link>
      </div>

      {/* Task list */}
      {sorted.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">
          배정된 할일이 없습니다
        </p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((task) => {
            const due = formatDueDate(task.due_date, task.status);
            const isDone = task.status === "완료";
            const isInProgress = task.status === "진행중";
            const firstAssignee = task.assignees?.[0];

            const subtitleParts: string[] = [];
            if (task.category) subtitleParts.push(task.category);
            if (due?.text) subtitleParts.push(due.text);
            const subtitle = subtitleParts.join(" · ");

            return (
              <li key={task.id}>
                <Link
                  href={`/dashboard/tasks/${task.id}`}
                  className={`flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 transition-all cursor-pointer group${isInProgress ? " bg-indigo-50/50" : ""}`}
                >
                  {/* Left indicator */}
                  {isDone ? (
                    <CheckCircle
                      weight="fill"
                      className="text-emerald-500 text-xl shrink-0"
                      size={20}
                    />
                  ) : isInProgress ? (
                    <div className="w-5 h-5 border-2 border-indigo-400 rounded-md flex items-center justify-center shrink-0">
                      <div className="w-2.5 h-2.5 bg-indigo-400 rounded-sm" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 border-2 border-slate-300 rounded-md shrink-0" />
                  )}

                  {/* Center */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-bold text-slate-700 truncate${isDone ? " line-through text-slate-400" : ""}`}
                    >
                      {task.title}
                    </p>
                    {subtitle && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {subtitle}
                      </p>
                    )}
                  </div>

                  {/* Right: assignee avatar */}
                  {firstAssignee && (
                    <UserAvatar
                      name={firstAssignee.full_name ?? "?"}
                      avatarUrl={firstAssignee.avatar_url}
                      size="md"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
