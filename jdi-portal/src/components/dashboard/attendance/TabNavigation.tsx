"use client";

// 아이콘별 deep import — 전체 phosphor-react 배럴 로드 회피
import Clock from "phosphor-react/dist/icons/Clock.esm.js";
import CalendarBlank from "phosphor-react/dist/icons/CalendarBlank.esm.js";
import Airplane from "phosphor-react/dist/icons/Airplane.esm.js";
import ShieldCheck from "phosphor-react/dist/icons/ShieldCheck.esm.js";
import type { AttendanceTabId } from "@/lib/attendance/constants";

interface Tab {
  id: AttendanceTabId;
  label: string;
  icon: React.ElementType;
}

interface TabNavigationProps {
  activeTab: AttendanceTabId;
  onTabChange: (tab: AttendanceTabId) => void;
  isAdmin: boolean;
}

const tabs: Tab[] = [
  { id: "checkin", label: "출퇴근", icon: Clock },
  { id: "records", label: "기록", icon: CalendarBlank },
  { id: "vacation", label: "휴가", icon: Airplane },
];

const adminTab: Tab = { id: "admin", label: "관리", icon: ShieldCheck };

export default function TabNavigation({ activeTab, onTabChange, isAdmin }: TabNavigationProps) {
  const allTabs = isAdmin ? [...tabs, adminTab] : tabs;

  return (
    <div className="glass-card rounded-2xl p-1.5 flex gap-1">
      {allTabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
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
  );
}
