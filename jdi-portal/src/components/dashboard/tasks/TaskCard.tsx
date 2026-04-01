"use client";

import { Draggable } from "@hello-pangea/dnd";
import { PRIORITY_CONFIG } from "@/lib/tasks/constants";
import { toDateString } from "@/lib/utils/date";
import type { TaskWithProfile } from "@/lib/tasks/types";

interface TaskCardProps {
  task: TaskWithProfile;
  index: number;
  onClick: () => void;
}

export default function TaskCard({ task, index, onClick }: TaskCardProps) {
  const priority = PRIORITY_CONFIG[task.priority];
  const today = toDateString();
  const isOverdue = task.due_date && task.due_date < today && task.status !== "완료";
  const isDueToday = task.due_date === today;

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`glass-card rounded-xl p-4 cursor-pointer transition-shadow duration-200 hover:shadow-md ${
            snapshot.isDragging ? "shadow-lg ring-2 ring-brand-300" : ""
          }`}
        >
          {/* Priority + Category + Assignee row */}
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${priority.bg} ${priority.text}`}>
              {task.priority}
            </span>
            {task.category && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                {task.category}
              </span>
            )}
            {task.assigned_profile && (
              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-50 text-brand-600">
                {task.assigned_profile.full_name}
              </span>
            )}
          </div>

          {/* Title */}
          <h4 className="text-sm font-medium text-slate-800 line-clamp-2 mb-3">{task.title}</h4>

          {/* Footer: due date + assignee */}
          <div className="flex items-center justify-between">
            {task.due_date ? (
              <span className={`text-xs font-medium ${
                isOverdue ? "text-red-500" : isDueToday ? "text-orange-500" : "text-slate-400"
              }`}>
                {task.due_date.slice(5).replace("-", "/")}
              </span>
            ) : (
              <span />
            )}
            {task.assigned_profile ? (
              <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-brand-500 to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold" title={task.assigned_profile.full_name}>
                {task.assigned_profile.full_name.charAt(0)}
              </div>
            ) : (
              <span />
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
