"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDashboardData, type DashboardData } from "@/lib/dashboard/queries";
import QuickStatsWidget from "./widgets/QuickStatsWidget";
import MyTasksWidget from "./widgets/MyTasksWidget";
import TodayScheduleWidget from "./widgets/TodayScheduleWidget";
import RecentActivityWidget from "./widgets/RecentActivityWidget";

interface Props {
  userId: string;
  userName: string;
}

export default function DashboardClient({ userId, userName }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const supabase = createClient();
    getDashboardData(supabase, userId, userName)
      .then(setData)
      .catch(console.error);
  }, [userId, userName]);

  const status = data?.todayRecord?.status ?? "미출근";
  const totalTasks = data?.allTasksForUser.length ?? 0;
  const myTasks = data?.myTasks ?? [];
  const completedTasks = totalTasks - myTasks.length;

  const urgentCount = myTasks.filter((t) => t.priority === "긴급").length;
  const highCount = myTasks.filter((t) => t.priority === "높음").length;

  const dateStr = useMemo(() => {
    return new Date().toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "좋은 아침이에요" : hour < 18 ? "좋은 오후에요" : "수고하셨습니다";

  return (
    <div className="space-y-8">
      {/* 인사 섹션 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            안녕하세요, {userName}님! 👋
          </h1>
          <p className="text-slate-400 mt-1">
            {dateStr} · {greeting}!
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
