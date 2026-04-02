"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, CircleDashed, Circle, CheckCircle } from "phosphor-react";
import type { TaskWithDetails, TaskStatus } from "@/lib/tasks/types";
import type { Profile } from "@/lib/attendance/types";
import { PRIORITY_CONFIG } from "@/lib/tasks/constants";
import TaskCreateModal from "../TaskCreateModal";

interface Props {
  taskId: string;
  subtasks: TaskWithDetails[];
  userId: string;
  profiles: Profile[];
  canEdit: boolean;
}

const STATUS_ICONS: Record<TaskStatus, React.ComponentType<import("phosphor-react").IconProps>> = {
  "대기": Circle,
  "진행중": CircleDashed,
  "완료": CheckCircle,
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  "대기": "text-slate-300",
  "진행중": "text-orange-500",
  "완료": "text-emerald-500",
};

export default function TaskSubtasks({ taskId, subtasks, userId, profiles, canEdit }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="bg-white rounded-3xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-700">서브태스크</h3>
        {canEdit && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 text-sm text-indigo-600 font-bold hover:text-indigo-500 transition-colors"
          >
            <Plus size={14} weight="bold" />
            추가
          </button>
        )}
      </div>

      {subtasks.length > 0 ? (
        <div className="space-y-2">
          {subtasks.map((sub) => {
            const StatusIcon = STATUS_ICONS[sub.status];
            const priorityConfig = PRIORITY_CONFIG[sub.priority];
            return (
              <div
                key={sub.id}
                onClick={() => router.push(`/dashboard/tasks/${sub.id}`)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-all"
              >
                <StatusIcon size={16} className={STATUS_COLORS[sub.status]} />
                <span
                  className={`flex-1 text-sm font-medium ${
                    sub.status === "완료" ? "line-through text-slate-400" : "text-slate-700"
                  }`}
                >
                  {sub.title}
                </span>
                <span
                  className={`px-2 py-0.5 ${priorityConfig.bg} ${priorityConfig.text} text-[10px] font-bold rounded-md`}
                >
                  {sub.priority}
                </span>
                {sub.assignees.length > 0 && (
                  <span className="text-xs text-slate-400">
                    {sub.assignees[0].full_name}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-400">서브태스크가 없습니다</p>
      )}

      {showCreate && (
        <TaskCreateModal
          userId={userId}
          profiles={profiles}
          onClose={() => {
            setShowCreate(false);
            router.refresh();
          }}
          parentId={taskId}
        />
      )}
    </div>
  );
}
