"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getTaskBasic,
  getChecklistItems,
  getSubtasksBasic,
  getAttachments,
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

export default function TaskDetailPanel({ profiles, userId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("detail");

  const [data, setData] = useState<TaskDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [sliding, setSliding] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 닫기 애니메이션 (taskId 소멸 감지)
  const prevTaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevTaskIdRef.current && !taskId) {
      setSliding(false);
      const timer = setTimeout(() => setVisible(false), 200);
      prevTaskIdRef.current = null;
      return () => clearTimeout(timer);
    }
    prevTaskIdRef.current = taskId;
  }, [taskId]);

  // taskId 변경 시 데이터 fetch
  useEffect(() => {
    if (!taskId) return;

    let cancelled = false;
    setVisible(true);
    setLoading(true);
    setError(null);

    // 약간의 지연 후 슬라이드 시작 (mount 직후 transition 적용을 위해)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setSliding(true);
      });
    });

    const supabase = createClient();

    Promise.all([
      getTaskBasic(supabase, taskId),
      getChecklistItems(supabase, taskId),
      getSubtasksBasic(supabase, taskId),
      getAttachments(supabase, taskId),
      getActivities(supabase, taskId),
    ])
      .then(([task, checklist, subtasks, attachments, activities]) => {
        if (cancelled) return;
        if (!task) {
          setError("할일을 찾을 수 없습니다.");
          setLoading(false);
          return;
        }
        task.checklist_total = checklist.length;
        task.checklist_completed = checklist.filter((c) => c.is_completed).length;
        task.subtask_count = subtasks.length;
        task.comment_count = activities.filter((a) => a.type === "comment").length;
        task.attachment_count = attachments.length;

        setData({ task, checklist, subtasks, attachments, activities });
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("데이터를 불러오는데 실패했습니다.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("detail");
      const qs = params.toString();
      router.push(`/dashboard/tasks${qs ? `?${qs}` : ""}`, { scroll: false });
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, router, searchParams]);

  function closePanel() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("detail");
    const qs = params.toString();
    router.push(`/dashboard/tasks${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  function navigateToTask(newTaskId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("detail", newTaskId);
    router.push(`/dashboard/tasks?${params.toString()}`, { scroll: false });
  }

  function handleRefresh() {
    if (!taskId) return;
    const supabase = createClient();
    Promise.all([
      getTaskBasic(supabase, taskId),
      getChecklistItems(supabase, taskId),
      getSubtasksBasic(supabase, taskId),
      getAttachments(supabase, taskId),
      getActivities(supabase, taskId),
    ]).then(([task, checklist, subtasks, attachments, activities]) => {
      if (!task) return;
      task.checklist_total = checklist.length;
      task.checklist_completed = checklist.filter((c) => c.is_completed).length;
      task.subtask_count = subtasks.length;
      task.comment_count = activities.filter((a) => a.type === "comment").length;
      task.attachment_count = attachments.length;
      setData({ task, checklist, subtasks, attachments, activities });
    }).catch((err) => {
      console.warn("[TaskDetailPanel] refresh failed:", err);
    });
  }

  // body scroll lock
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black transition-opacity duration-200 ${
          sliding ? "opacity-30" : "opacity-0"
        }`}
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`absolute top-0 right-0 h-full w-full sm:w-[55%] sm:min-w-[480px] bg-slate-50 shadow-2xl transform transition-transform duration-300 ease-out overflow-hidden ${
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
