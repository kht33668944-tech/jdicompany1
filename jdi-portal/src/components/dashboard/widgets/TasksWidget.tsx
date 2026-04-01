"use client";

import { useState } from "react";
import Link from "next/link";
import { ListChecks, CheckCircle, Circle } from "phosphor-react";

interface Task {
  id: number;
  title: string;
  completed: boolean;
}

const initialTasks: Task[] = [
  { id: 1, title: "상품 이미지 업데이트", completed: true },
  { id: 2, title: "4월 프로모션 기획안 작성", completed: false },
  { id: 3, title: "CS 문의 답변 처리", completed: false },
  { id: 4, title: "재고 현황 확인", completed: true },
];

export default function TasksWidget() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  const toggleTask = (id: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ListChecks size={18} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-500">할일</h3>
        </div>
        <span className="text-xs font-medium text-slate-400">
          {completedCount}/{tasks.length} 완료
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${(completedCount / tasks.length) * 100}%` }}
        />
      </div>

      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              onClick={() => toggleTask(task.id)}
              className="flex items-center gap-3 w-full text-left py-1.5 group"
            >
              {task.completed ? (
                <CheckCircle size={20} weight="fill" className="text-brand-500 shrink-0" />
              ) : (
                <Circle size={20} className="text-slate-300 group-hover:text-slate-400 shrink-0" />
              )}
              <span
                className={`text-sm transition-colors ${
                  task.completed
                    ? "line-through text-slate-400"
                    : "text-slate-700 group-hover:text-slate-900"
                }`}
              >
                {task.title}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Link
        href="/dashboard/tasks"
        className="flex items-center justify-center gap-1 mt-4 pt-3 border-t border-slate-100 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
      >
        전체 보기
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 256 256">
          <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"/>
        </svg>
      </Link>
    </div>
  );
}
