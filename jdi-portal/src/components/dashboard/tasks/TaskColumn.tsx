"use client";

import { Droppable } from "@hello-pangea/dnd";
import TaskCard from "./TaskCard";
import { TASK_STATUS_CONFIG } from "@/lib/tasks/constants";
import type { TaskStatus, TaskWithProfile } from "@/lib/tasks/types";

interface TaskColumnProps {
  status: TaskStatus;
  tasks: TaskWithProfile[];
  onCardClick: (task: TaskWithProfile) => void;
}

export default function TaskColumn({ status, tasks, onCardClick }: TaskColumnProps) {
  const config = TASK_STATUS_CONFIG[status];

  return (
    <div className="flex flex-col min-w-[280px] flex-1">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
        <h3 className="text-sm font-bold text-slate-700">{status}</h3>
        <span className="text-xs text-slate-400 ml-auto">{tasks.length}</span>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 space-y-2 p-2 rounded-xl min-h-[200px] transition-colors ${
              snapshot.isDraggingOver ? "bg-brand-50/50" : "bg-slate-50/50"
            }`}
          >
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onClick={() => onCardClick(task)}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
