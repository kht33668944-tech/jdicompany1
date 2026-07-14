"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { DashboardData } from "@/lib/dashboard/queries";
import type { Profile } from "@/lib/attendance/types";
import type {
  WorkTimelineEntryWithProfile,
  WorkTimelineProfile,
} from "@/lib/work-timeline/types";
import TodayWorkBoardWidget from "./widgets/TodayWorkBoardWidget";

const WorkTimelineSection = dynamic(
  () => import("./work-timeline/WorkTimelineSection"),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-24 animate-pulse rounded-xl border border-slate-100 bg-slate-50/60"
        aria-label="업무 타임라인을 불러오는 중"
        aria-busy="true"
      />
    ),
  },
);

interface Props {
  userId: string;
  userName: string;
  initialData: DashboardData;
  initialTimelineEntries: WorkTimelineEntryWithProfile[];
  timelineProfiles: WorkTimelineProfile[];
  currentUserRole: Profile["role"];
  initialLoadedAt: number;
  defaultTaskAssigneeFilter: string;
}

export default function DashboardClient({
  userId,
  userName,
  initialData,
  initialTimelineEntries,
  timelineProfiles,
  currentUserRole,
  initialLoadedAt,
  defaultTaskAssigneeFilter,
}: Props) {
  const router = useRouter();
  const data = initialData;
  const loadedAtRef = useRef(initialLoadedAt);
  const inFlightRef = useRef(false);
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
    loadedAtRef.current = initialLoadedAt;
    inFlightRef.current = false;
  }, [initialLoadedAt]);

  useEffect(() => {
    const refreshIfStale = () => {
      if (Date.now() - loadedAtRef.current < 60_000 || inFlightRef.current) return;
      inFlightRef.current = true;
      router.refresh();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };

    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshIfStale);
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
        profiles={data.taskSummary.profiles}
        taskSummary={data.taskSummary}
        attendanceStatuses={data.todayAttendanceStatuses}
        schedules={data.todaySchedules}
        defaultAssigneeFilter={defaultTaskAssigneeFilter}
      />
    </div>
  );
}
