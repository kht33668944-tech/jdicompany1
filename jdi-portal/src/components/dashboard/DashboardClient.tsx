"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { DashboardData } from "@/lib/dashboard/queries";
import type { TaskWithDetails } from "@/lib/tasks/types";
import { toDateString, toDateStringFromTimestamp } from "@/lib/utils/date";
import TodayWorkBoardWidget from "./widgets/TodayWorkBoardWidget";

interface Props {
  userName: string;
  initialData: DashboardData;
}

function isTodayWorkTask(task: TaskWithDetails, today: string): boolean {
  if (task.status === "완료") return false;
  if (task.due_date && task.due_date <= today) return true;
  if (task.start_date && task.start_date <= today) return true;
  return toDateStringFromTimestamp(task.created_at) === today;
}

function isCompletedToday(task: TaskWithDetails, today: string): boolean {
  return task.status === "완료" && toDateStringFromTimestamp(task.updated_at) === today;
}

export default function DashboardClient({ userName, initialData }: Props) {
  const router = useRouter();
  const data = initialData;
  // 시간 기반 문자열은 서버(싱가포르)와 브라우저(한국)의 시각 차이로
  // hydration mismatch를 일으켜 전체 재렌더링을 유발 → 마운트 후에만 계산
  const [timeInfo, setTimeInfo] = useState<{ dateStr: string; greeting: string } | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const now = new Date();
      const dateStr = now.toLocaleDateString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      });
      const hour = Number(new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(now));
      const greeting = hour < 12 ? "좋은 아침이에요" : hour < 18 ? "좋은 오후에요" : "수고하셨습니다";
      setTimeInfo({ dateStr, greeting });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const refreshDashboard = () => router.refresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshDashboard();
    };

    refreshDashboard();
    window.addEventListener("focus", refreshDashboard);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshDashboard);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

  const status = data?.todayRecord?.status ?? "미출근";
  const today = toDateString();
  const userTasks = data?.allTasksForUser ?? [];
  const todayTasks = userTasks.filter((task) => isTodayWorkTask(task, today));
  const completedTodayTasks = userTasks.filter((task) => isCompletedToday(task, today));
  const totalTodayTasks = todayTasks.length + completedTodayTasks.length;
  const todayScheduleCount = data?.todaySchedules.length ?? 0;

  return (
    <div className="space-y-8">
      {/* 인사 섹션 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            안녕하세요, {userName}님
          </h1>
          <p className="text-slate-400 mt-1 min-h-[1.25rem]">
            {timeInfo ? `${timeInfo.dateStr} · ${timeInfo.greeting}!` : ""}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-bold text-slate-400">오늘</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            {status} · 할 일 {completedTodayTasks.length}/{totalTodayTasks} · 일정 {todayScheduleCount}
          </p>
        </div>
      </div>

      <TodayWorkBoardWidget
        profiles={data?.allProfiles ?? []}
        attendanceRecords={data?.todayAttendanceRecords ?? []}
        tasks={data?.allTasks ?? []}
        schedules={data?.todaySchedules ?? []}
        canViewCompanyWork={data?.canViewCompanyWork ?? false}
      />
    </div>
  );
}
