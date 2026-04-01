"use client";

import MyTasksList from "../MyTasksList";
import type { Profile } from "@/lib/attendance/types";
import type { TaskWithProfile } from "@/lib/tasks/types";

interface MyTasksTabProps {
  tasks: TaskWithProfile[];
  userId: string;
  profiles: Profile[];
}

export default function MyTasksTab({ tasks, userId, profiles }: MyTasksTabProps) {
  return <MyTasksList tasks={tasks} userId={userId} profiles={profiles} />;
}
