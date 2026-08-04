"use client";

import { useState, useEffect, type ReactNode } from "react";
import type { DashboardData } from "@/lib/dashboard/queries";
import { useLiveRefresh } from "@/lib/hooks/useLiveRefresh";
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
  const data = initialData;
  // 알림 도착·포커스 복귀·주기 검사 때 서버 데이터를 다시 불러와
  // 열어 둔 대시보드가 로그아웃 없이 최신을 유지한다
  useLiveRefresh(initialLoadedAt);
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

      {/* 검토함은 출근 여부와 무관하게 항상 펼쳐 둔다 — 놓치면 안 되는 인박스라서 */}
      <ReviewInboxWidget
        toFix={data.pendingReviews.toFix}
        toConfirm={data.pendingReviews.toConfirm}
      />

      <TodayWorkBoardWidget
        userId={userId}
        profiles={data.taskSummary.profiles}
        taskSummary={data.taskSummary}
        attendanceStatuses={data.todayAttendanceStatuses}
        schedules={data.todaySchedules}
        defaultAssigneeFilter={defaultTaskAssigneeFilter}
        directivePendingCounts={data.directivePendingCounts}
        recentActivities={data.recentActivities}
      />
    </div>
  );
}
