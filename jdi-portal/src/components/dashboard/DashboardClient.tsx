"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { DashboardData } from "@/lib/dashboard/queries";
import DirectiveInboxWidget from "./widgets/DirectiveInboxWidget";
import ReviewInboxWidget from "./widgets/ReviewInboxWidget";
import TodayWorkBoardWidget from "./widgets/TodayWorkBoardWidget";

interface Props {
  userId: string;
  userName: string;
  initialData: DashboardData;
  children: ReactNode;
  initialLoadedAt: number;
  defaultTaskAssigneeFilter: string;
}

export default function DashboardClient({
  userId,
  userName,
  initialData,
  children,
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

      {children}

      <DirectiveInboxWidget
        userId={userId}
        directives={data.pendingDirectives}
        attendanceStatuses={data.todayAttendanceStatuses}
      />

      <ReviewInboxWidget
        toFix={data.pendingReviews.toFix}
        toConfirm={data.pendingReviews.toConfirm}
        attendanceStatuses={data.todayAttendanceStatuses}
        currentUserId={userId}
      />

      <TodayWorkBoardWidget
        userId={userId}
        profiles={data.taskSummary.profiles}
        taskSummary={data.taskSummary}
        attendanceStatuses={data.todayAttendanceStatuses}
        schedules={data.todaySchedules}
        defaultAssigneeFilter={defaultTaskAssigneeFilter}
        directivePendingCounts={data.directivePendingCounts}
      />
    </div>
  );
}
