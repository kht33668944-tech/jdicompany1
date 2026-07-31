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

// 이 시간이 지나면 화면 데이터를 오래된 것으로 보고 다시 불러온다
const STALE_AFTER_MS = 60_000;
// Realtime 알림이 유실돼도 화면이 보이는 동안 이 주기로 신선도를 검사한다
const STALE_CHECK_INTERVAL_MS = 90_000;
// router.refresh() 가 네트워크 문제로 끝을 알리지 못해도
// 이 시간이 지나면 다시 갱신을 시도할 수 있다 (갱신이 영구히 막히는 것 방지)
const REFRESH_IN_FLIGHT_TIMEOUT_MS = 15_000;

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
  const inFlightAtRef = useRef(0);
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
    inFlightAtRef.current = 0;
  }, [initialLoadedAt]);

  useEffect(() => {
    const refreshNow = () => {
      if (Date.now() - inFlightAtRef.current < REFRESH_IN_FLIGHT_TIMEOUT_MS) return;
      inFlightAtRef.current = Date.now();
      router.refresh();
    };
    const refreshIfStale = () => {
      if (Date.now() - loadedAtRef.current < STALE_AFTER_MS) return;
      refreshNow();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
    // 검토 요청·업무지시 알림이 Realtime 으로 도착하면 위젯 데이터도 즉시 다시 불러온다
    const handleNotification = () => refreshNow();

    // 마운트 직후 한 번 — 라우터 캐시(staleTimes 5분)가 되살린 오래된 화면 대비
    refreshIfStale();
    // 화면이 보이는 동안 주기 검사 — Realtime 구독이 끊겨 있어도 몇 분 안에 따라잡는 안전망
    const staleCheckTimer = window.setInterval(handleVisibilityChange, STALE_CHECK_INTERVAL_MS);

    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("jdi:notification-received", handleNotification);
    return () => {
      window.clearInterval(staleCheckTimer);
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("jdi:notification-received", handleNotification);
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
        recentActivities={data.recentActivities}
      />
    </div>
  );
}
