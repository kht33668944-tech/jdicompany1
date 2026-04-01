"use client";

import { useState, useMemo } from "react";
import TaskBoard from "../TaskBoard";
import TaskFilters from "../TaskFilters";
import TaskCreateModal from "../TaskCreateModal";
import TaskDetailModal from "../TaskDetailModal";
import type { Profile } from "@/lib/attendance/types";
import type { TaskWithProfile, TaskPriority } from "@/lib/tasks/types";

interface BoardTabProps {
  tasks: TaskWithProfile[];
  profiles: Profile[];
  userId: string;
}

export default function BoardTab({ tasks, profiles, userId }: BoardTabProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskWithProfile | null>(null);
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<TaskPriority | null>(null);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterAssignee && t.assigned_to !== filterAssignee) return false;
      if (filterCategory && t.category !== filterCategory) return false;
      if (filterPriority && t.priority !== filterPriority) return false;
      return true;
    });
  }, [tasks, filterAssignee, filterCategory, filterPriority]);

  return (
    <div className="space-y-4">
      <TaskFilters
        profiles={profiles}
        filterAssignee={filterAssignee}
        filterCategory={filterCategory}
        filterPriority={filterPriority}
        onFilterAssignee={setFilterAssignee}
        onFilterCategory={setFilterCategory}
        onFilterPriority={setFilterPriority}
        onCreateClick={() => setShowCreate(true)}
      />

      <TaskBoard tasks={filteredTasks} onCardClick={setSelectedTask} />

      {showCreate && (
        <TaskCreateModal userId={userId} profiles={profiles} onClose={() => setShowCreate(false)} />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          userId={userId}
          profiles={profiles}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
