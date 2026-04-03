"use client";

import { useState, useRef, useCallback } from "react";
import { CaretLeft, CaretRight } from "phosphor-react";
import type { TaskWithDetails } from "@/lib/tasks/types";
import { TASK_STATUS_CONFIG } from "@/lib/tasks/constants";
import { toDateString, addDays, toDateStringFromTimestamp } from "@/lib/utils/date";

interface Props {
  tasks: TaskWithDetails[];
  onTaskClick: (taskId: string) => void;
}

type Scale = "weekly" | "monthly";

const SCALE_DAYS: Record<Scale, number> = {
  weekly: 7,
  monthly: 30,
};

function diffDays(a: string, b: string): number {
  const msPerDay = 86400000;
  const dateA = new Date(`${a}T00:00:00Z`);
  const dateB = new Date(`${b}T00:00:00Z`);
  return Math.round((dateB.getTime() - dateA.getTime()) / msPerDay);
}

function formatHeaderDate(dateStr: string, scale: Scale): string {
  const d = new Date(`${dateStr}T12:00:00+09:00`);
  if (scale === "weekly") {
    return d.toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
  }
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  });
}

export default function TimelineView({ tasks, onTaskClick }: Props) {
  const today = toDateString();
  const [scale, setScale] = useState<Scale>("monthly");
  const [viewStart, setViewStart] = useState<string>(() => {
    const totalDays = SCALE_DAYS["monthly"];
    return addDays(today, -Math.floor(totalDays / 4));
  });

  const sidebarRef = useRef<HTMLDivElement>(null);
  const timelineBodyRef = useRef<HTMLDivElement>(null);

  const totalDays = SCALE_DAYS[scale];

  // Parent tasks only
  const parentTasks = tasks.filter((t) => t.parent_id === null);

  const handleScaleChange = (newScale: Scale) => {
    const days = SCALE_DAYS[newScale];
    setViewStart(addDays(today, -Math.floor(days / 4)));
    setScale(newScale);
  };

  const shiftView = (direction: -1 | 1) => {
    const shift = Math.floor(totalDays / 2);
    setViewStart((prev) => addDays(prev, direction * shift));
  };

  // Sync scroll between sidebar and timeline body
  const syncSidebarScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (timelineBodyRef.current) {
      timelineBodyRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  }, []);

  const syncTimelineScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (sidebarRef.current) {
      sidebarRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  }, []);

  // Build date columns array
  const dateColumns: string[] = [];
  for (let i = 0; i < totalDays; i++) {
    dateColumns.push(addDays(viewStart, i));
  }

  // Today position percentage
  const todayOffset = diffDays(viewStart, today);
  const todayPct = (todayOffset / totalDays) * 100;
  const todayVisible = todayOffset >= 0 && todayOffset < totalDays;

  // Bar geometry for a task
  function getBarGeometry(task: TaskWithDetails): { left: number; width: number } | null {
    const startStr = task.start_date ?? toDateStringFromTimestamp(task.created_at);
    const endStr = task.due_date ?? addDays(startStr, 3);

    const startOffset = diffDays(viewStart, startStr);
    const endOffset = diffDays(viewStart, endStr);

    // Clamp to viewport
    const clampedStart = Math.max(0, startOffset);
    const clampedEnd = Math.min(totalDays, endOffset + 1);

    if (clampedStart >= clampedEnd) return null;

    const left = (clampedStart / totalDays) * 100;
    const width = ((clampedEnd - clampedStart) / totalDays) * 100;
    return { left, width };
  }

  const colMinWidth = scale === "weekly" ? 120 : 40;
  const timelineMinWidth = colMinWidth * totalDays;

  return (
    <div className="bg-white rounded-[24px] shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 p-4 md:p-6 border-b border-slate-50">
        {/* Scale toggle */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {(["weekly", "monthly"] as Scale[]).map((s) => (
            <button
              key={s}
              onClick={() => handleScaleChange(s)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                scale === s
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {s === "weekly" ? "주간" : "월간"}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center flex-wrap gap-2 md:gap-4 text-xs md:text-sm font-bold text-slate-400">
          {(["대기", "진행중", "완료"] as const).map((status) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${TASK_STATUS_CONFIG[status].dot}`} />
              {status}
            </span>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftView(-1)}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <CaretLeft size={16} weight="bold" />
          </button>
          <button
            onClick={() => {
              const days = SCALE_DAYS[scale];
              setViewStart(addDays(today, -Math.floor(days / 4)));
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            오늘
          </button>
          <button
            onClick={() => shiftView(1)}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <CaretRight size={16} weight="bold" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden" style={{ maxHeight: "500px" }}>
        {/* Left sidebar */}
        <div className="w-full md:w-64 lg:w-80 flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-50 flex flex-col overflow-hidden">
          {/* Sidebar header */}
          <div className="h-12 flex-shrink-0 border-b border-slate-50 flex items-center px-4 md:px-6">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              할일명
            </span>
          </div>
          {/* Sidebar rows */}
          <div
            ref={sidebarRef}
            className="overflow-y-auto flex-1 scrollbar-hide max-h-[200px] md:max-h-none"
            onScroll={syncSidebarScroll}
          >
            {parentTasks.length === 0 ? (
              <div className="h-16 flex items-center px-4 md:px-6 text-sm text-slate-400">
                할일이 없습니다
              </div>
            ) : (
              parentTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => onTaskClick(task.id)}
                  className="w-full h-16 flex flex-col justify-center px-4 md:px-6 border-b border-slate-50 hover:bg-slate-50/60 transition-colors text-left"
                >
                  <span className="text-sm font-bold text-slate-700 truncate leading-tight">
                    {task.title}
                  </span>
                  {task.assignees.length > 0 && (
                    <span className="text-[10px] text-slate-400 truncate mt-0.5">
                      {task.assignees.map((a) => a.full_name).join(", ")}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right timeline area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Timeline header (scrollable horizontally) */}
          <div className="overflow-x-auto flex-shrink-0 scrollbar-hide">
            <div style={{ minWidth: `${timelineMinWidth}px` }}>
              <div className="h-12 flex border-b border-slate-50">
                {dateColumns.map((dateStr) => {
                  const isToday = dateStr === today;
                  return (
                    <div
                      key={dateStr}
                      style={{ minWidth: `${colMinWidth}px`, flex: 1 }}
                      className={`flex items-center justify-center ${
                        isToday ? "bg-indigo-50/30" : ""
                      }`}
                    >
                      <span
                        className={`text-[10px] font-bold ${
                          isToday ? "text-indigo-500" : "text-slate-400"
                        }`}
                      >
                        {formatHeaderDate(dateStr, scale)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Timeline body — scrollable both axes */}
          <div
            ref={timelineBodyRef}
            className="overflow-auto flex-1"
            onScroll={syncTimelineScroll}
          >
            <div style={{ minWidth: `${timelineMinWidth}px`, position: "relative" }}>
              {/* Today vertical line */}
              {todayVisible && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-indigo-500/40 pointer-events-none z-10"
                  style={{ left: `${todayPct}%` }}
                />
              )}

              {parentTasks.length === 0 ? (
                <div className="h-16" />
              ) : (
                parentTasks.map((task) => {
                  const geo = getBarGeometry(task);
                  const config = TASK_STATUS_CONFIG[task.status];

                  return (
                    <div
                      key={task.id}
                      className="h-16 relative flex items-center border-b border-slate-50"
                    >
                      {geo && (
                        <button
                          onClick={() => onTaskClick(task.id)}
                          className={`absolute h-8 rounded-full flex items-center px-3 overflow-hidden transition-opacity hover:opacity-80 ${config.bg} ${config.text}`}
                          style={{
                            left: `${geo.left}%`,
                            width: `${geo.width}%`,
                            minWidth: "24px",
                          }}
                          title={task.title}
                        >
                          <span className="text-[10px] font-bold truncate whitespace-nowrap">
                            {task.status}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
