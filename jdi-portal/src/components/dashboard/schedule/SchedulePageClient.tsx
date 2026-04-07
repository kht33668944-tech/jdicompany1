"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarBlank, List, CalendarCheck, Calendar, Plus, Buildings, User, FunnelSimple } from "phosphor-react";
import MonthlyCalendar from "./MonthlyCalendar";
import WeeklyView from "./WeeklyView";
import DailyView from "./DailyView";
import ListView from "./ListView";
import DaySidebar from "./DaySidebar";
import ScheduleCreateModal from "./ScheduleCreateModal";
import ScheduleDetailModal from "./ScheduleDetailModal";
import { toDateString } from "@/lib/utils/date";
import { createClient } from "@/lib/supabase/client";
import { getMonthSchedules } from "@/lib/schedule/queries";
import {
  getCachedMonth,
  cacheMonth,
  invalidateMonthCache,
} from "@/lib/schedule/scheduleCache";
import type { ScheduleTabId, ScheduleWithProfile } from "@/lib/schedule/types";
import type { Profile } from "@/lib/attendance/types";

type VisibilityFilter = "all" | "company" | "mine";

interface SchedulePageClientProps {
  schedules: ScheduleWithProfile[];
  profiles: Profile[];
  currentYear: number;
  currentMonth: number;
  userId: string;
  userRole: string;
}

interface Tab {
  id: ScheduleTabId;
  label: string;
  icon: React.ElementType;
}

const STORAGE_KEY = "schedule-active-tab";
const tabs: Tab[] = [
  { id: "monthly", label: "월간", icon: CalendarBlank },
  { id: "weekly", label: "주간", icon: Calendar },
  { id: "daily", label: "일간", icon: CalendarCheck },
  { id: "list", label: "목록", icon: List },
];

function getInitialTab(): ScheduleTabId {
  if (typeof window === "undefined") return "monthly";
  return (window.localStorage.getItem(STORAGE_KEY) as ScheduleTabId | null) ?? "monthly";
}

export default function SchedulePageClient({
  schedules: initialSchedules,
  profiles,
  currentYear: initialYear,
  currentMonth: initialMonth,
  userId,
  userRole,
}: SchedulePageClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ScheduleTabId>(getInitialTab);
  const [selectedDate, setSelectedDate] = useState<string>(toDateString());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleWithProfile | null>(null);
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");

  // 클라이언트 상태로 month/schedules 관리 — props 는 최초 시드로만 사용
  const [currentYear, setCurrentYear] = useState<number>(initialYear);
  const [currentMonth, setCurrentMonth] = useState<number>(initialMonth);
  const [schedules, setSchedules] = useState<ScheduleWithProfile[]>(initialSchedules);

  // 진행 중인 fetch 의 키 — 응답 도착 시점의 race 가드
  // - refetch 가 set 하면 캐시 콜백은 자기보다 먼저 도착할 때만 적용
  // - fetch 완료 후 null 로 리셋 → 늦게 도착한 캐시 콜백이 fresh 를 덮어쓰지 못함
  const inflightKeyRef = useRef<string | null>(null);

  // 최초 mount 시 props 데이터를 IDB 에 시드
  useEffect(() => {
    void cacheMonth(initialYear, initialMonth, initialSchedules);
    // initialXxx 변경 시 재실행하지 않음 (router.refresh 후 stale 데이터로 덮어쓰기 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSchedules = useMemo(() => schedules.filter((s) => {
    if (visibilityFilter === "all") return true;
    if (visibilityFilter === "company") return s.visibility === "company";
    const isCreator = s.created_by === userId;
    const isParticipant = s.schedule_participants?.some((p) => p.user_id === userId) ?? false;
    return isCreator || isParticipant;
  }), [schedules, visibilityFilter, userId]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, activeTab);
  }, [activeTab]);

  const refetchMonth = async (year: number, month: number) => {
    const key = `${year}-${month}`;
    inflightKeyRef.current = key;
    try {
      const supabase = createClient();
      const fresh = await getMonthSchedules(supabase, year, month);
      if (inflightKeyRef.current !== key) return;
      setSchedules(fresh);
      void cacheMonth(year, month, fresh);
    } catch (err) {
      console.warn("[schedule] refetch failed:", err);
    } finally {
      // fresh 적용 후 inflight 해제 → 늦게 도착한 캐시 콜백이 덮어쓰지 못함
      if (inflightKeyRef.current === key) inflightKeyRef.current = null;
    }
  };

  const handleMonthChange = (year: number, month: number) => {
    if (year === currentYear && month === currentMonth) return;

    setCurrentYear(year);
    setCurrentMonth(month);

    const key = `${year}-${month}`;
    inflightKeyRef.current = key;

    // IDB 캐시 → 즉시 표시 (단 fresh 가 먼저 도착했으면 무시)
    void getCachedMonth(year, month).then((cached) => {
      if (!cached) return;
      if (inflightKeyRef.current !== key) return;
      setSchedules(cached);
    });

    void refetchMonth(year, month);

    router.replace(`/dashboard/schedule?year=${year}&month=${month}`, { scroll: false });
  };

  const revalidateCurrentMonth = async () => {
    await invalidateMonthCache(currentYear, currentMonth);
    await refetchMonth(currentYear, currentMonth);
  };

  const handleScheduleCreated = () => {
    setShowCreateModal(false);
    void revalidateCurrentMonth();
  };

  const handleScheduleUpdated = () => {
    setSelectedSchedule(null);
    void revalidateCurrentMonth();
  };

  return (
    <div className="space-y-6">
      {/* 탭 바 + 월 네비게이션 + 새 일정 버튼 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="glass-card rounded-2xl p-1.5 flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-white text-brand-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                }`}
              >
                <Icon size={18} weight={active ? "fill" : "regular"} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="glass-card rounded-2xl p-1.5 flex gap-1">
            {([
              { id: "all" as const, label: "전체", icon: FunnelSimple },
              { id: "company" as const, label: "회사", icon: Buildings },
              { id: "mine" as const, label: "내 일정", icon: User },
            ]).map((filter) => {
              const Icon = filter.icon;
              const active = visibilityFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  onClick={() => setVisibilityFilter(filter.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                    active
                      ? "bg-white text-brand-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                  }`}
                >
                  <Icon size={14} weight={active ? "fill" : "regular"} />
                  {filter.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-500/20 transition-all duration-200"
          >
          <Plus size={18} weight="bold" />
            새 일정 추가
          </button>
        </div>
      </div>

      {/* 월간 뷰 */}
      {activeTab === "monthly" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <MonthlyCalendar
              schedules={filteredSchedules}
              year={currentYear}
              month={currentMonth}
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
              onMonthChange={handleMonthChange}
              onDateDoubleClick={(dateStr) => {
                setSelectedDate(dateStr);
                setShowCreateModal(true);
              }}
              onEventClick={setSelectedSchedule}
            />
          </div>
          <div className="lg:col-span-1">
            <DaySidebar
              schedules={filteredSchedules}
              selectedDate={selectedDate}
              onEventClick={setSelectedSchedule}
            />
          </div>
        </div>
      )}

      {/* 주간 뷰 */}
      {activeTab === "weekly" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <WeeklyView
              schedules={filteredSchedules}
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
              onWeekChange={(dateStr) => {
                setSelectedDate(dateStr);
                const d = new Date(`${dateStr}T12:00:00+09:00`);
                const y = d.getFullYear();
                const m = d.getMonth() + 1;
                if (y !== currentYear || m !== currentMonth) {
                  handleMonthChange(y, m);
                }
              }}
              onEventClick={setSelectedSchedule}
            />
          </div>
          <div className="lg:col-span-1">
            <DaySidebar
              schedules={filteredSchedules}
              selectedDate={selectedDate}
              onEventClick={setSelectedSchedule}
            />
          </div>
        </div>
      )}

      {/* 일간 뷰 */}
      {activeTab === "daily" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <DailyView
              schedules={filteredSchedules}
              selectedDate={selectedDate}
              onDateSelect={(dateStr) => {
                setSelectedDate(dateStr);
                const d = new Date(`${dateStr}T12:00:00+09:00`);
                const y = d.getFullYear();
                const m = d.getMonth() + 1;
                if (y !== currentYear || m !== currentMonth) {
                  handleMonthChange(y, m);
                }
              }}
              onEventClick={setSelectedSchedule}
            />
          </div>
          <div className="lg:col-span-1">
            <DaySidebar
              schedules={filteredSchedules}
              selectedDate={selectedDate}
              onEventClick={setSelectedSchedule}
            />
          </div>
        </div>
      )}

      {/* 목록 뷰 */}
      {activeTab === "list" && (
        <ListView
          schedules={filteredSchedules}
          onEventClick={setSelectedSchedule}
        />
      )}

      {/* 모달 */}
      {showCreateModal && (
        <ScheduleCreateModal
          userId={userId}
          profiles={profiles}
          defaultDate={selectedDate}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleScheduleCreated}
        />
      )}

      {selectedSchedule && (
        <ScheduleDetailModal
          schedule={selectedSchedule}
          userId={userId}
          userRole={userRole}
          profiles={profiles}
          onClose={() => setSelectedSchedule(null)}
          onUpdated={handleScheduleUpdated}
        />
      )}
    </div>
  );
}
