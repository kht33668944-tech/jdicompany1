"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SquaresFour,
  Clock,
  ListChecks,
  CalendarBlank,
  GearSix,
  SignOut,
  CaretLeft,
} from "phosphor-react";

interface SidebarProps {
  user: { email: string; name: string };
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const navItems = [
  { href: "/dashboard", label: "대시보드", icon: SquaresFour },
  { href: "/dashboard/attendance", label: "근태관리", icon: Clock },
  { href: "/dashboard/tasks", label: "할일", icon: ListChecks },
  { href: "/dashboard/schedule", label: "스케줄", icon: CalendarBlank },
  { href: "/dashboard/settings", label: "설정", icon: GearSix },
];

export default function Sidebar({ user, collapsed, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-200/50">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center shadow-md shadow-brand-500/20 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="white" viewBox="0 0 256 256">
            <path d="M223.68,66.15,135.68,15a15.88,15.88,0,0,0-15.36,0l-88,51.12A16,16,0,0,0,24,80v96a16,16,0,0,0,8.32,14l88,51.12a15.88,15.88,0,0,0,15.36,0l88-51.12A16,16,0,0,0,232,176V80A16,16,0,0,0,223.68,66.15ZM128,29.09,207.39,75.1,128,120.91,48.61,75.1ZM40,90l80,45.51V223.56L40,176ZM136,223.56V135.56L216,90v86Z"/>
          </svg>
        </div>
        {!collapsed && (
          <span className="text-sm font-bold text-slate-800 tracking-tight">JDICOMPANY</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                active
                  ? "bg-brand-50 text-brand-600 shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              } ${collapsed ? "justify-center" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={20} weight={active ? "fill" : "regular"} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="px-3 py-4 border-t border-slate-200/50">
        <div className={`flex items-center gap-3 px-3 py-2 ${collapsed ? "justify-center" : ""}`}>
          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-brand-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700 truncate">{user.name}</p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </div>
          )}
        </div>
        <form action="/auth/signout" method="post" className="mt-2">
          <button
            type="submit"
            className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-all duration-200 ${
              collapsed ? "justify-center" : ""
            }`}
            title={collapsed ? "로그아웃" : undefined}
          >
            <SignOut size={18} className="shrink-0" />
            {!collapsed && <span>로그아웃</span>}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block fixed top-0 left-0 h-screen z-30 glass-sidebar transition-all duration-300 ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar */}
      <aside
        className={`lg:hidden fixed top-0 left-0 h-screen w-64 z-50 glass-sidebar transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
