"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Circle, Clock } from "phosphor-react";
import { updateTask } from "@/lib/tasks/actions";
import { PRIORITY_CONFIG, TASK_STATUS_CONFIG } from "@/lib/tasks/constants";
import { toDateString } from "@/lib/utils/date";
import TaskDetailModal from "./TaskDetailModal";
import type { Profile } from "@/lib/attendance/types";
import type { TaskWithProfile, TaskStatus } from "@/lib/tasks/types";

interface MyTasksListProps {
  tasks: TaskWithProfile[];
  userId: string;
  profiles: Profile[];
}

export default function MyTasksList({ tasks, userId, profiles }: MyTasksListProps) {
  const router = useRouter();
  const [selectedTask, setSelectedTask] = useState<TaskWithProfile | null>(null);
  const today = toDateString();

  const grouped: Record<TaskStatus, TaskWithProfile[]> = {
    "대기": tasks.filter((t) => t.status === "대기"),
    "진행중": tasks.filter((t) => t.status === "진행중"),
    "완료": tasks.filter((t) => t.status === "완료"),
  };

  const toggleComplete = async (task: TaskWithProfile) => {
    const newStatus: TaskStatus = task.status === "완료" ? "대기" : "완료";
    try {
      await updateTask(task.id, { status: newStatus });
      router.refresh();
    } catch (e) {
      console.error("상태 변경 실패:", e);
    }
  };

  const renderSection = (status: TaskStatus, items: TaskWithProfile[]) => {
    if (items.length === 0) return null;
    const config = TASK_STATUS_CONFIG[status];

    return (
      <div key={status} className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
          <h3 className="text-sm font-bold text-slate-700">{status}</h3>
          <span className="text-xs text-slate-400">{items.length}</span>
        </div>

        <ul className="space-y-2">
          {items.map((task) => {
            const priorityConfig = PRIORITY_CONFIG[task.priority];
            const isOverdue = task.due_date && task.due_date < today && task.status !== "완료";
            const isComplete = task.status === "완료";

            return (
              <li key={task.id} className="flex items-center gap-3 py-2 group">
                <button onClick={() => toggleComplete(task)} className="shrink-0">
                  {isComplete ? (
                    <CheckCircle size={22} weight="fill" className="text-emerald-500" />
                  ) : (
                    <Circle size={22} className="text-slate-300 group-hover:text-slate-400" />
                  )}
                </button>

                <button
                  onClick={() => setSelectedTask(task)}
                  className={`flex-1 text-left text-sm ${
                    isComplete ? "line-through text-slate-400" : "text-slate-700 group-hover:text-slate-900"
                  }`}
                >
                  {task.title}
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${priorityConfig.bg} ${priorityConfig.text}`}>
                    {task.priority}
                  </span>
                  {task.due_date && (
                    <span className={`text-xs ${isOverdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
                      {task.due_date.slice(5).replace("-", "/")}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  if (tasks.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <p className="text-slate-400 text-sm">나에게 배정된 할일이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {renderSection("진행중", grouped["진행중"])}
      {renderSection("대기", grouped["대기"])}
      {renderSection("완료", grouped["완료"])}

      {selectedTask && (
        <TaskDetailModal task={selectedTask} userId={userId} profiles={profiles} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
}
