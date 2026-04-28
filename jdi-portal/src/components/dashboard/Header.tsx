"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
// 아이콘별 deep import — 전체 phosphor-react 배럴 로드 회피 (서버 cold-start ↓)
import List from "phosphor-react/dist/icons/List.esm.js";
import CaretLeft from "phosphor-react/dist/icons/CaretLeft.esm.js";
import GearSix from "phosphor-react/dist/icons/GearSix.esm.js";
import SignOut from "phosphor-react/dist/icons/SignOut.esm.js";
import WarningCircle from "phosphor-react/dist/icons/WarningCircle.esm.js";
import NotificationCenter from "./NotificationCenter";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import UserAvatar from "@/components/shared/UserAvatar";
import LogoutButton from "@/components/LogoutButton";

const ReportQuickDrawer = dynamic(() => import("./reports/ReportQuickDrawer"), {
  ssr: false,
});

interface HeaderProps {
  user: { id: string; email: string; name: string; avatarUrl?: string | null };
  onMenuClick: () => void;
  onCollapseToggle: () => void;
  collapsed: boolean;
  unreadCount: number;
  onUnreadCountChange: (count: number) => void;
}

const titles: Record<string, string> = {
  "/dashboard": "대시보드",
  "/dashboard/attendance": "근태관리",
  "/dashboard/tasks": "할일",
  "/dashboard/schedule": "스케줄",
  "/dashboard/reports": "오류 접수",
  "/dashboard/settings": "설정",
};

export default function Header({ user, onMenuClick, onCollapseToggle, collapsed, unreadCount, onUnreadCountChange }: HeaderProps) {
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showReportDrawer, setShowReportDrawer] = useState(false);
  const dropdownRef = useClickOutside<HTMLDivElement>(() => setDropdownOpen(false));

  const pageTitle = titles[pathname] ?? "대시보드";

  return (
    <>
    <header className="sticky top-0 z-20 glass-header">
      <div className="flex items-center justify-between h-16 px-6">
        {/* Left */}
        <div className="flex items-center gap-4">
          {/* Mobile hamburger */}
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <List size={22} />
          </button>

          {/* Desktop collapse toggle */}
          <button
            onClick={onCollapseToggle}
            className="hidden lg:flex p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <CaretLeft
              size={18}
              className={`transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
            />
          </button>

          <h1 className="text-lg font-bold text-slate-800">{pageTitle}</h1>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          {/* Bug report shortcut */}
          <button
            onClick={() => setShowReportDrawer(true)}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-brand-600 transition-colors"
            title="오류 접수"
          >
            <WarningCircle size={22} />
          </button>

          {/* Notifications */}
          <NotificationCenter
            userId={user.id}
            unreadCount={unreadCount}
            onUnreadCountChange={onUnreadCountChange}
          />

          {/* User dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 p-2 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="md" />
              <span className="hidden sm:block text-sm font-medium text-slate-700">{user.name}</span>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white border border-slate-200 shadow-lg shadow-slate-200/50 py-1 animate-fade-in">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-700">{user.name}</p>
                  <p className="text-xs text-slate-400 truncate">{user.email}</p>
                </div>
                <Link
                  href="/dashboard/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <GearSix size={16} />
                  설정
                </Link>
                <LogoutButton className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                  <SignOut size={16} />
                  로그아웃
                </LogoutButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>

      {showReportDrawer && (
        <ReportQuickDrawer
          open={showReportDrawer}
          onClose={() => setShowReportDrawer(false)}
          userId={user.id}
        />
      )}
    </>
  );
}
