"use client";

import { useCallback, useEffect, useState } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { useRouter } from "next/navigation";
import TaskColumn from "./TaskColumn";
import { moveTask } from "@/lib/tasks/actions";
import { TASK_STATUSES } from "@/lib/tasks/constants";
import type { TaskStatus, TaskWithProfile } from "@/lib/tasks/types";

interface TaskBoardProps {
  tasks: TaskWithProfile[];
  onCardClick: (task: TaskWithProfile) => void;
}

function reorderTasks(
  previousTasks: TaskWithProfile[],
  source: DropResult["source"],
  destination: NonNullable<DropResult["destination"]>
) {
  const nextTasks = previousTasks.map((task) => ({ ...task }));
  const sourceTasks = nextTasks
    .filter((task) => task.status === source.droppableId)
    .sort((a, b) => a.position - b.position);
  const destinationTasks =
    source.droppableId === destination.droppableId
      ? sourceTasks
      : nextTasks
          .filter((task) => task.status === destination.droppableId)
          .sort((a, b) => a.position - b.position);

  const movedTask = sourceTasks[source.index];
  if (!movedTask) return previousTasks;

  sourceTasks.splice(source.index, 1);
  const updatedMovedTask = { ...movedTask, status: destination.droppableId as TaskStatus };

  if (source.droppableId === destination.droppableId) {
    sourceTasks.splice(destination.index, 0, updatedMovedTask);
    sourceTasks.forEach((task, index) => {
      task.position = index;
    });
  } else {
    destinationTasks.splice(destination.index, 0, updatedMovedTask);
    sourceTasks.forEach((task, index) => {
      task.position = index;
    });
    destinationTasks.forEach((task, index) => {
      task.position = index;
    });
  }

  return nextTasks;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export default function TaskBoard({ tasks: initialTasks, onCardClick }: TaskBoardProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const tasksByStatus = TASK_STATUSES.reduce((acc, status) => {
    acc[status] = tasks
      .filter((task) => task.status === status)
      .sort((a, b) => a.position - b.position);
    return acc;
  }, {} as Record<TaskStatus, TaskWithProfile[]>);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    setFeedback(null);
    setIsSaving(true);
    setTasks((prev) => reorderTasks(prev, source, destination));

    try {
      await moveTask(draggableId, destination.droppableId as TaskStatus, destination.index);
      router.refresh();
    } catch (error) {
      setFeedback(getErrorMessage(error, "상태 이동을 저장하지 못했습니다. 다시 시도해 주세요."));
      setTasks(initialTasks);
    } finally {
      setIsSaving(false);
    }
  }, [initialTasks, router]);

  return (
    <div className="space-y-3">
      {feedback && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {feedback}
        </div>
      )}
      {isSaving && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          변경 사항을 저장하고 있습니다...
        </div>
      )}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className={`flex gap-4 overflow-x-auto pb-4 transition-opacity ${isSaving ? "opacity-80" : ""}`}>
          {TASK_STATUSES.map((status) => (
            <TaskColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status]}
              onCardClick={onCardClick}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
