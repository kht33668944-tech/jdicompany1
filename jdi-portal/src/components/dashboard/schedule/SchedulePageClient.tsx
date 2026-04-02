"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarBlank, List, CalendarCheck, Calendar, Plus, Buildings, User, FunnelSimple } from "phosphor-react";
import MonthlyCalendar from "./MonthlyCalendar";
import WeeklyView from "./WeeklyView";
import DailyView from "./DailyView";
import ListView from "./ListView";
import DaySidebar from "./DaySidebar";
import ScheduleCreateModal from "./ScheduleCreateModal";
import ScheduleDetailModal from "./ScheduleDetailModal";
import { toDateString, addDays } from "@/lib/utils/date";
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
  schedules,
  profiles,
  currentYear,
  currentMonth,
  userId,
  userRole,
}: SchedulePageClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ScheduleTabId>(getInitialTab);
  const [selectedDate, setSelectedDate] = useState<string>(toDateString());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleWithProfile | null>(null);
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");

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

  const handleMonthChange = (year: number, month: number) => {
    router.push(`/dashboard/schedule?year=${year}&month=${month}`);
  };

  const handleScheduleCreated = () => {
    setShowCreateModal(false);
    router.refresh();
  };

  const handleScheduleUpdated = () => {
    setSelectedSchedule(null);
    router.refresh();
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
          schedules={schedules}
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
