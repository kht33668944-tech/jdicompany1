"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { DashboardData } from "@/lib/dashboard/queries";
import type { Profile } from "@/lib/attendance/types";
import type {
  WorkTimelineEntryWithProfile,
  WorkTimelineProfile,
} from "@/lib/work-timeline/types";
import WorkTimelineSection from "./work-timeline/WorkTimelineSection";
import TodayWorkBoardWidget from "./widgets/TodayWorkBoardWidget";

interface Props {
  userId: string;
  userName: string;
  initialData: DashboardData;
  initialTimelineEntries: WorkTimelineEntryWithProfile[];
  timelineProfiles: WorkTimelineProfile[];
  currentUserRole: Profile["role"];
}

export default function DashboardClient({
  userId,
  userName,
  initialData,
  initialTimelineEntries,
  timelineProfiles,
  currentUserRole,
}: Props) {
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

  return (
    <div className="space-y-8">
      {/* 인사 섹션 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          안녕하세요, {userName}님
        </h1>
        <p className="text-slate-400 mt-1 min-h-[1.25rem]">
          {timeInfo ? `${timeInfo.dateStr} · ${timeInfo.greeting}!` : ""}
        </p>
      </div>

      <WorkTimelineSection
        initialEntries={initialTimelineEntries}
        profiles={timelineProfiles}
        currentUserId={userId}
        currentUserRole={currentUserRole}
        compact
      />

      <TodayWorkBoardWidget
        userId={userId}
        profiles={data?.allProfiles ?? []}
        attendanceRecords={data?.todayAttendanceRecords ?? []}
        tasks={data?.allTasks ?? []}
        schedules={data?.todaySchedules ?? []}
        canViewCompanyWork={data?.canViewCompanyWork ?? false}
      />
    </div>
  );
}
