"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getTaskBasic,
  getChecklistItems,
  getActivities,
} from "@/lib/tasks/queries";
import type { Profile } from "@/lib/attendance/types";
import type {
  TaskWithDetails,
  TaskChecklistItem,
  TaskAttachment,
  TaskActivity,
} from "@/lib/tasks/types";
import TaskDetailClient from "./detail/TaskDetailClient";

interface Props {
  profiles: Profile[];
  userId: string;
}

interface TaskDetailData {
  task: TaskWithDetails;
  checklist: TaskChecklistItem[];
  subtasks: TaskWithDetails[];
  attachments: TaskAttachment[];
  activities: TaskActivity[];
}

type PanelPhase = "closed" | "opening" | "open" | "closing";

export default function TaskDetailPanel({ profiles, userId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("detail");

  const [data, setData] = useState<TaskDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<PanelPhase>("closed");
  const [prevTaskId, setPrevTaskId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 파생 상태
  const visible = phase !== "closed";
  const sliding = phase === "open";
  const loading = !!taskId && !data && !error;

  // taskId 변경 시 상태 조정 (렌더 중 — React 권장 패턴)
  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId);
    if (taskId) {
      setPhase("opening");
      setData(null);
      setError(null);
    } else if (prevTaskId) {
      setPhase("closing");
    }
  }

  // opening → open (rAF 비동기 콜백)
  useEffect(() => {
    if (phase !== "opening") return;
    const raf = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // closing → closed (200ms 후)
  useEffect(() => {
    if (phase !== "closing") return;
    const timer = setTimeout(() => {
      setPhase("closed");
      setData(null);
      setError(null);
    }, 200);
    return () => clearTimeout(timer);
  }, [phase]);

  // taskId 변경 시 데이터 fetch
  useEffect(() => {
    if (!taskId) return;

    let cancelled = false;
    const supabase = createClient();

    Promise.all([
      getTaskBasic(supabase, taskId),
      getChecklistItems(supabase, taskId),
      getActivities(supabase, taskId),
    ])
      .then(([task, checklist, activities]) => {
        if (cancelled) return;
        if (!task) {
          setError("할일을 찾을 수 없습니다.");
          return;
        }
        task.checklist_total = checklist.length;
        task.checklist_completed = checklist.filter((c) => c.is_completed).length;
        task.comment_count = activities.filter((a) => a.type === "comment").length;
        setData({ task, checklist, subtasks: [], attachments: [], activities });
      })
      .catch(() => {
        if (cancelled) return;
        setError("데이터를 불러오는데 실패했습니다.");
      });

    return () => { cancelled = true; };
  }, [taskId]);

  const closePanel = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("detail");
    const qs = params.toString();
    router.push(`/dashboard/tasks${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [searchParams, router]);

  const navigateToTask = useCallback((newTaskId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("detail", newTaskId);
    router.push(`/dashboard/tasks?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const handleRefresh = useCallback(() => {
    if (!taskId) return;
    const supabase = createClient();
    Promise.all([
      getTaskBasic(supabase, taskId),
      getChecklistItems(supabase, taskId),
      getActivities(supabase, taskId),
    ]).then(([task, checklist, activities]) => {
      if (!task) return;
      task.checklist_total = checklist.length;
      task.checklist_completed = checklist.filter((c) => c.is_completed).length;
      task.comment_count = activities.filter((a) => a.type === "comment").length;
      setData({ task, checklist, subtasks: [], attachments: [], activities });
    }).catch((err) => {
      console.warn("[TaskDetailPanel] refresh failed:", err);
    });
  }, [taskId]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, closePanel]);

  // body scroll lock
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className={`absolute inset-0 bg-black transition-opacity duration-200 ${
          sliding ? "opacity-30" : "opacity-0"
        }`}
        onClick={closePanel}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`absolute top-0 right-0 h-full w-full sm:w-[55%] sm:min-w-[480px] bg-slate-50 shadow-2xl transform transition-transform duration-200 ease-out overflow-hidden ${
          sliding ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-6 lg:p-8">
          {loading && (
            <div className="space-y-6 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-4 w-20 bg-slate-200 rounded" />
                <div className="h-8 w-16 bg-slate-200 rounded-xl" />
              </div>
              <div className="bg-white rounded-3xl p-6 space-y-4">
                <div className="h-6 w-3/4 bg-slate-200 rounded" />
                <div className="h-4 w-1/2 bg-slate-200 rounded" />
                <div className="h-20 w-full bg-slate-100 rounded-xl" />
              </div>
              <div className="bg-white rounded-3xl p-6 space-y-3">
                <div className="h-4 w-24 bg-slate-200 rounded" />
                <div className="h-8 w-full bg-slate-100 rounded-lg" />
                <div className="h-8 w-full bg-slate-100 rounded-lg" />
              </div>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <p className="text-sm text-red-500">{error}</p>
              <button
                onClick={closePanel}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white rounded-xl shadow-sm hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
          )}

          {!loading && !error && data && (
            <TaskDetailClient
              task={data.task}
              checklist={data.checklist}
              subtasks={data.subtasks}
              attachments={data.attachments}
              activities={data.activities}
              profiles={profiles}
              userId={userId}
              mode="panel"
              onClose={closePanel}
              onNavigate={navigateToTask}
              onRefresh={handleRefresh}
            />
          )}
        </div>
      </div>
    </div>
  );
}
