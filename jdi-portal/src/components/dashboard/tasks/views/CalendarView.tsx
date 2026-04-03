"use client";

import { useState } from "react";
import { CaretLeft, CaretRight } from "phosphor-react";
import { toDateString, getDaysInMonth, getFirstDayOfMonth } from "@/lib/utils/date";
import { PRIORITY_CONFIG } from "@/lib/tasks/constants";
import type { TaskWithDetails } from "@/lib/tasks/types";

interface Props {
  tasks: TaskWithDetails[];
  onTaskClick: (taskId: string) => void;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const MAX_TASKS_PER_CELL = 3;

interface CalendarDay {
  year: number;
  month: number; // 1-based
  day: number;
  isCurrentMonth: boolean;
  dateStr: string;
}

function buildDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildCalendarGrid(year: number, month: number): CalendarDay[] {
  const firstWeekday = getFirstDayOfMonth(year, month);
  const daysInCurrent = getDaysInMonth(year, month);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const daysInPrev = getDaysInMonth(prevYear, prevMonth);

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const cells: CalendarDay[] = [];

  // Trailing days from previous month
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const day = daysInPrev - i;
    cells.push({
      year: prevYear,
      month: prevMonth,
      day,
      isCurrentMonth: false,
      dateStr: buildDateStr(prevYear, prevMonth, day),
    });
  }

  // Current month days
  for (let day = 1; day <= daysInCurrent; day++) {
    cells.push({
      year,
      month,
      day,
      isCurrentMonth: true,
      dateStr: buildDateStr(year, month, day),
    });
  }

  // Leading days from next month
  const remaining = 42 - cells.length; // 6 rows × 7 cols
  for (let day = 1; day <= remaining; day++) {
    cells.push({
      year: nextYear,
      month: nextMonth,
      day,
      isCurrentMonth: false,
      dateStr: buildDateStr(nextYear, nextMonth, day),
    });
  }

  return cells;
}

function groupTasksByDate(tasks: TaskWithDetails[]): Map<string, TaskWithDetails[]> {
  const map = new Map<string, TaskWithDetails[]>();
  for (const task of tasks) {
    if (!task.due_date) continue;
    const key = task.due_date;
    const existing = map.get(key);
    if (existing) {
      existing.push(task);
    } else {
      map.set(key, [task]);
    }
  }
  return map;
}

export default function CalendarView({ tasks, onTaskClick }: Props) {
  const today = toDateString();
  const todayParts = today.split("-").map(Number);

  const [year, setYear] = useState(todayParts[0]);
  const [month, setMonth] = useState(todayParts[1]);

  const tasksByDate = groupTasksByDate(tasks);
  const calendarDays = buildCalendarGrid(year, month);

  function goToPrevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  function goToToday() {
    setYear(todayParts[0]);
    setMonth(todayParts[1]);
  }

  const monthLabel = `${year}년 ${month}월`;

  return (
    <div className="bg-white rounded-[24px] shadow-sm p-3 md:p-8">
      {/* Month navigation header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg md:text-xl font-bold text-slate-800">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={goToPrevMonth}
            className="p-2 hover:bg-slate-50 rounded-xl transition-colors"
            aria-label="이전 달"
          >
            <CaretLeft size={18} className="text-slate-500" />
          </button>
          <button
            onClick={goToToday}
            className="px-4 py-2 hover:bg-slate-50 rounded-xl text-sm font-bold text-slate-600 transition-colors"
          >
            오늘
          </button>
          <button
            onClick={goToNextMonth}
            className="p-2 hover:bg-slate-50 rounded-xl transition-colors"
            aria-label="다음 달"
          >
            <CaretRight size={18} className="text-slate-500" />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
        {/* Weekday headers */}
        {WEEKDAYS.map((day, idx) => (
          <div
            key={day}
            className={`bg-slate-50 p-2 md:p-4 text-center text-[10px] md:text-xs font-bold uppercase ${
              idx === 0
                ? "text-red-400"
                : idx === 6
                  ? "text-blue-400"
                  : "text-slate-400"
            }`}
          >
            {day}
          </div>
        ))}

        {/* Day cells */}
        {calendarDays.map((cell) => {
          const isToday = cell.dateStr === today;
          const cellTasks = tasksByDate.get(cell.dateStr) ?? [];
          const visibleTasks = cellTasks.slice(0, MAX_TASKS_PER_CELL);
          const overflowCount = cellTasks.length - visibleTasks.length;
          const dayOfWeek = new Date(`${cell.dateStr}T12:00:00+09:00`).getDay();

          const dateNumberClass = !cell.isCurrentMonth
            ? "text-slate-300"
            : dayOfWeek === 0
              ? "text-red-500"
              : dayOfWeek === 6
                ? "text-blue-500"
                : "text-slate-700";

          return (
            <div
              key={cell.dateStr}
              className={`bg-white min-h-[72px] md:min-h-[140px] p-1.5 md:p-4 ${
                isToday
                  ? "ring-2 ring-inset ring-indigo-500/20 bg-indigo-50/30"
                  : ""
              }`}
            >
              {/* Date number */}
              <div
                className={`text-xs md:text-sm font-bold mb-1 md:mb-2 ${dateNumberClass} ${
                  isToday
                    ? "w-5 h-5 md:w-7 md:h-7 flex items-center justify-center rounded-full bg-indigo-500 text-white"
                    : ""
                }`}
              >
                {cell.day}
              </div>

              {/* Task pills */}
              <div className="flex flex-col gap-1">
                {visibleTasks.map((task) => {
                  const config = PRIORITY_CONFIG[task.priority];
                  return (
                    <button
                      key={task.id}
                      onClick={() => onTaskClick(task.id)}
                      className={`flex items-center gap-1 px-1 py-0.5 md:px-2 md:py-1 rounded md:rounded-lg text-[8px] md:text-[10px] font-bold truncate w-full text-left ${config.bg} ${config.text} hover:opacity-80 transition-opacity`}
                    >
                      <span
                        className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full flex-shrink-0 ${config.dot}`}
                      />
                      <span className="truncate">{task.title}</span>
                    </button>
                  );
                })}

                {overflowCount > 0 && (
                  <div className="text-[10px] font-bold text-slate-400 px-2 py-0.5">
                    +{overflowCount}개 더보기
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
