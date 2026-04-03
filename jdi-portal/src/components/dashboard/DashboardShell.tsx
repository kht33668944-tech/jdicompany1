"use client";

import { useState, useCallback } from "react";
import { Toaster } from "sonner";
import Sidebar from "./Sidebar";
import Header from "./Header";
import NotificationProvider from "./NotificationProvider";

interface DashboardShellProps {
  user: { id: string; email: string; name: string; avatarUrl?: string | null };
  children: React.ReactNode;
}

export default function DashboardShell({ user, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleNewNotification = useCallback(() => {
    setUnreadCount((prev) => prev + 1);
  }, []);

  return (
    <NotificationProvider
      userId={user.id}
      onNewNotification={handleNewNotification}
    >
      <div className="min-h-screen bg-slate-50">
        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar
          user={user}
          collapsed={sidebarCollapsed}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />

        <div
          className={`transition-all duration-300 ${
            sidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-64"
          }`}
        >
          <Header
            user={user}
            onMenuClick={() => setSidebarOpen(true)}
            onCollapseToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            collapsed={sidebarCollapsed}
            unreadCount={unreadCount}
            onUnreadCountChange={setUnreadCount}
          />
          <main className="p-6">{children}</main>
        </div>
      </div>

      <Toaster
        position="bottom-right"
        toastOptions={{
          className: "!rounded-2xl !border-slate-200/50 !shadow-lg",
          style: { fontFamily: "Pretendard, sans-serif" },
        }}
      />
    </NotificationProvider>
  );
}
