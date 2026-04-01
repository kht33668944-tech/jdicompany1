"use client";

import { useEffect, useState } from "react";
import { SquaresFour, User } from "phosphor-react";
import BoardTab from "./tabs/BoardTab";
import MyTasksTab from "./tabs/MyTasksTab";
import type { Profile } from "@/lib/attendance/types";
import type { TaskTabId, TaskWithProfile } from "@/lib/tasks/types";

interface TasksPageClientProps {
  allTasks: TaskWithProfile[];
  myTasks: TaskWithProfile[];
  profiles: Profile[];
  userId: string;
}

interface Tab {
  id: TaskTabId;
  label: string;
  icon: React.ElementType;
}

const STORAGE_KEY = "tasks-active-tab";
const tabs: Tab[] = [
  { id: "board", label: "보드", icon: SquaresFour },
  { id: "my-tasks", label: "내 할일", icon: User },
];

function getInitialTab(): TaskTabId {
  if (typeof window === "undefined") {
    return "board";
  }

  return (window.localStorage.getItem(STORAGE_KEY) as TaskTabId | null) ?? "board";
}

export default function TasksPageClient({ allTasks, myTasks, profiles, userId }: TasksPageClientProps) {
  const [activeTab, setActiveTab] = useState<TaskTabId>(getInitialTab);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, activeTab);
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-1.5 flex gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                active
                  ? "bg-white text-brand-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              }`}
            >
              <Icon size={18} weight={active ? "fill" : "regular"} />
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.id === "my-tasks" && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-brand-100 text-brand-600" : "bg-slate-100 text-slate-500"}`}>
                  {myTasks.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "board" && <BoardTab tasks={allTasks} profiles={profiles} userId={userId} />}
      {activeTab === "my-tasks" && <MyTasksTab tasks={myTasks} userId={userId} profiles={profiles} />}
    </div>
  );
}
