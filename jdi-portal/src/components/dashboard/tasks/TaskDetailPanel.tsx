"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
  taskId: string | null;
  initialTask: TaskWithDetails | null;
  onClose: () => void;
  onNavigate: (taskId: string) => void;
}

interface TaskDetailData {
  task: TaskWithDetails;
  checklist: TaskChecklistItem[];
  subtasks: TaskWithDetails[];
  attachments: TaskAttachment[];
  activities: TaskActivity[];
}

type PanelPhase = "closed" | "opening" | "open" | "closing";

export default function TaskDetailPanel({
  profiles,
  userId,
  taskId,
  initialTask,
  onClose,
  onNavigate,
}: Props) {
  const [data, setData] = useState<TaskDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<PanelPhase>("closed");
  const [prevTaskId, setPrevTaskId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const visible = phase !== "closed";
  const sliding = phase === "open";
  const loading = !!taskId && !data && !error;

  // taskId 변경 시 상태 조정 (렌더 중 — React 권장 패턴)
  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId);
    if (taskId) {
      setPhase("opening");
      setError(null);
      // allTasks 캐시에서 즉시 시드 → 제목/담당자/기간 즉시 표시
      if (initialTask && initialTask.id === taskId) {
        setData({
          task: initialTask,
          checklist: [],
          subtasks: [],
          attachments: [],
          activities: [],
        });
      } else {
        setData(null);
      }
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

  // 딥링크 대응: 렌더 시점엔 initialTask 가 없었지만 allTasks 로딩 후 도착한 경우 시드
  useEffect(() => {
    if (!taskId || data) return;
    if (initialTask && initialTask.id === taskId) {
      setData({
        task: initialTask,
        checklist: [],
        subtasks: [],
        attachments: [],
        activities: [],
      });
    }
  }, [taskId, initialTask, data]);

  // taskId 변경 시 체크리스트 + 활동 백그라운드 fetch
  // (initialTask 가 있으면 task 재조회 생략 — 가장 느린 경로 차단)
  useEffect(() => {
    if (!taskId) return;

    let cancelled = false;
    const supabase = createClient();

    const hasCachedTask = !!initialTask && initialTask.id === taskId;
    const promises: Promise<unknown>[] = [
      getChecklistItems(supabase, taskId),
      getActivities(supabase, taskId),
    ];
    if (!hasCachedTask) promises.push(getTaskBasic(supabase, taskId));

    Promise.all(promises)
      .then((results) => {
        if (cancelled) return;
        const checklist = results[0] as TaskChecklistItem[];
        const activities = results[1] as TaskActivity[];
        const fetchedTask = hasCachedTask
          ? null
          : (results[2] as TaskWithDetails | null);
        const task = fetchedTask ?? (hasCachedTask ? initialTask : null);
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
    // allTasks 백그라운드 갱신으로 initialTask 참조가 바뀌어도 재fetch 하지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

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
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, onClose]);

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
        onClick={onClose}
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
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white rounded-xl shadow-sm hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
          )}

          {!error && data && (
            <TaskDetailClient
              task={data.task}
              checklist={data.checklist}
              subtasks={data.subtasks}
              attachments={data.attachments}
              activities={data.activities}
              profiles={profiles}
              userId={userId}
              mode="panel"
              onClose={onClose}
              onNavigate={onNavigate}
              onRefresh={handleRefresh}
            />
          )}
        </div>
      </div>
    </div>
  );
}
