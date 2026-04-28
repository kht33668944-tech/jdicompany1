"use client";

import { useState, useEffect } from "react";
import type { DashboardData } from "@/lib/dashboard/queries";
import QuickStatsWidget from "./widgets/QuickStatsWidget";
import MyTasksWidget from "./widgets/MyTasksWidget";
import TodayScheduleWidget from "./widgets/TodayScheduleWidget";
import RecentActivityWidget from "./widgets/RecentActivityWidget";

interface Props {
  userId: string;
  userName: string;
  initialData: DashboardData;
}

export default function DashboardClient({ userId, userName, initialData }: Props) {
  const [data] = useState<DashboardData | null>(initialData);
  // 시간 기반 문자열은 서버(싱가포르)와 브라우저(한국)의 시각 차이로
  // hydration mismatch를 일으켜 전체 재렌더링을 유발 → 마운트 후에만 계산
  const [timeInfo, setTimeInfo] = useState<{ dateStr: string; greeting: string } | null>(null);

  useEffect(() => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
    const hour = now.getHours();
    const greeting = hour < 12 ? "좋은 아침이에요" : hour < 18 ? "좋은 오후에요" : "수고하셨습니다";
    setTimeInfo({ dateStr, greeting });
  }, []);

  const status = data?.todayRecord?.status ?? "미출근";
  const totalTasks = data?.allTasksForUser.length ?? 0;
  const myTasks = data?.myTasks ?? [];
  const completedTasks = totalTasks - myTasks.length;

  const urgentCount = myTasks.filter((t) => t.priority === "긴급").length;
  const highCount = myTasks.filter((t) => t.priority === "높음").length;

  return (
    <div className="space-y-8">
      {/* 인사 섹션 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            안녕하세요, {userName}님! 👋
          </h1>
          <p className="text-slate-400 mt-1 min-h-[1.25rem]">
            {timeInfo ? `${timeInfo.dateStr} · ${timeInfo.greeting}!` : ""}
          </p>
        </div>
      </div>

      {/* 상단: 상태 카드 4칸 */}
      <QuickStatsWidget
        userId={userId}
        attendanceStatus={status}
        checkInTime={data?.todayRecord?.check_in ?? null}
        checkOutTime={data?.todayRecord?.check_out ?? null}
        taskTotal={totalTasks}
        taskCompleted={completedTasks}
        urgentCount={urgentCount}
        highCount={highCount}
        todayScheduleCount={data?.todaySchedules.length ?? 0}
        nextScheduleMinutes={data?.nextScheduleMinutes ?? null}
        weeklyMinutes={data?.weeklyMinutes ?? 0}
      />

      {/* 중단: 2열 위젯 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <MyTasksWidget tasks={myTasks} />
        <TodayScheduleWidget schedules={data?.todaySchedules ?? []} />
      </div>

      {/* 하단: 활동 피드 */}
      <RecentActivityWidget activities={data?.recentActivities ?? []} />
    </div>
  );
}
