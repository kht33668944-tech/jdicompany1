"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellRinging,
  UserPlus,
  ChatDots,
  ArrowsClockwise,
  Warning,
  CheckCircle,
  XCircle,
  CalendarPlus,
  Megaphone,
  UserCirclePlus,
  Checks,
  ChatCircle,
} from "phosphor-react";
import { createClient } from "@/lib/supabase/client";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { markAsRead, markAllAsRead } from "@/lib/notifications/actions";
import {
  getDesktopPermission,
  requestDesktopPermission,
  isDesktopSupported,
  isDesktopEnabled,
  setDesktopEnabled,
  type DesktopPermission,
} from "@/lib/notifications/desktop";
import { formatTimeAgo } from "@/lib/utils/date";
import type { Notification, NotificationType } from "@/lib/notifications/types";

const TYPE_ICONS: Record<NotificationType, React.ElementType> = {
  task_assigned: UserPlus,
  task_comment: ChatDots,
  task_status_changed: ArrowsClockwise,
  task_deadline: Warning,
  vacation_approved: CheckCircle,
  vacation_rejected: XCircle,
  schedule_invite: CalendarPlus,
  system_announce: Megaphone,
  signup_pending: UserCirclePlus,
  chat_message: ChatCircle,
  work_schedule_change_requested: Bell,
  work_schedule_approved: CheckCircle,
  work_schedule_rejected: XCircle,
  hire_date_change_requested: Bell,
  hire_date_approved: CheckCircle,
  hire_date_rejected: XCircle,
};

const TYPE_COLORS: Record<NotificationType, string> = {
  task_assigned: "text-blue-500 bg-blue-50",
  task_comment: "text-green-500 bg-green-50",
  task_status_changed: "text-amber-500 bg-amber-50",
  task_deadline: "text-red-500 bg-red-50",
  vacation_approved: "text-emerald-500 bg-emerald-50",
  vacation_rejected: "text-red-500 bg-red-50",
  schedule_invite: "text-purple-500 bg-purple-50",
  system_announce: "text-blue-600 bg-blue-50",
  signup_pending: "text-orange-500 bg-orange-50",
  chat_message: "text-indigo-500 bg-indigo-50",
  work_schedule_change_requested: "text-violet-500 bg-violet-50",
  work_schedule_approved: "text-emerald-500 bg-emerald-50",
  work_schedule_rejected: "text-red-500 bg-red-50",
  hire_date_change_requested: "text-violet-500 bg-violet-50",
  hire_date_approved: "text-emerald-500 bg-emerald-50",
  hire_date_rejected: "text-red-500 bg-red-50",
};

interface NotificationCenterProps {
  userId: string;
  unreadCount: number;
  onUnreadCountChange: (count: number) => void;
}

export default function NotificationCenter({
  userId,
  unreadCount,
  onUnreadCountChange,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [desktopPermission, setDesktopPermission] = useState<DesktopPermission>("default");
  const [desktopSupported, setDesktopSupported] = useState(false);
  const [desktopEnabled, setDesktopEnabledState] = useState(true);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const router = useRouter();

  // 마운트 시 데스크톱 알림 지원 여부 + 권한 + 로컬 토글 상태 동기화 (SSR-safe)
  useEffect(() => {
    setDesktopSupported(isDesktopSupported());
    setDesktopPermission(getDesktopPermission());
    setDesktopEnabledState(isDesktopEnabled());
  }, [open]);

  const handleRequestDesktopPermission = useCallback(async () => {
    const result = await requestDesktopPermission();
    setDesktopPermission(result);
  }, []);

  const handleToggleDesktop = useCallback(() => {
    const next = !desktopEnabled;
    setDesktopEnabled(next);
    setDesktopEnabledState(next);
  }, [desktopEnabled]);

  // 드롭다운 열릴 때 알림 목록 fetch
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (!error && data) {
        setNotifications(data as Notification[]);
        const unread = (data as Notification[]).filter((n) => !n.is_read).length;
        onUnreadCountChange(unread);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, onUnreadCountChange]);

  // 초기 unread count fetch
  useEffect(() => {
    async function fetchCount() {
      const supabase = createClient();
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      onUnreadCountChange(count ?? 0);
    }
    fetchCount();
  }, [userId, onUnreadCountChange]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchNotifications();
  };

  const handleClickItem = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
      onUnreadCountChange(Math.max(0, unreadCount - 1));
    }
    setOpen(false);
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead(userId);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    onUnreadCountChange(0);
  };

  return (
    <div ref={ref} className="relative">
      {/* 벨 버튼 */}
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-slate-200 shadow-lg shadow-slate-200/50 animate-fade-in z-50">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-700 text-sm">알림</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors"
              >
                <Checks size={14} />
                모두 읽음
              </button>
            )}
          </div>

          {/* 데스크톱 알림 권한 상태 — 항상 표시 */}
          {desktopSupported && (
            <div className="border-b border-slate-100">
              {desktopPermission === "default" && (
                <button
                  onClick={handleRequestDesktopPermission}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-brand-50/60 hover:bg-brand-50 text-brand-700 text-xs font-medium transition-colors"
                >
                  <BellRinging size={14} weight="fill" />
                  <span className="flex-1 text-left">데스크톱 알림 켜기 — Windows 알림으로 받기</span>
                </button>
              )}
              {desktopPermission === "granted" && (
                <button
                  onClick={handleToggleDesktop}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors ${
                    desktopEnabled
                      ? "bg-emerald-50/60 hover:bg-emerald-50 text-emerald-700"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-500"
                  }`}
                  aria-pressed={desktopEnabled}
                >
                  <BellRinging size={14} weight={desktopEnabled ? "fill" : "regular"} />
                  <span className="flex-1 text-left">
                    데스크톱 알림 {desktopEnabled ? "켜짐" : "꺼짐"}
                  </span>
                  {/* 스위치 */}
                  <span
                    className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors ${
                      desktopEnabled ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
                        desktopEnabled ? "translate-x-3.5" : "translate-x-0.5"
                      }`}
                    />
                  </span>
                </button>
              )}
              {desktopPermission === "denied" && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 text-slate-500 text-[11px]">
                  <BellRinging size={12} />
                  <span>데스크톱 알림이 차단됨 — 브라우저 사이트 설정에서 허용해주세요.</span>
                </div>
              )}
            </div>
          )}

          {/* 알림 목록 */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-slate-400">
                불러오는 중...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                새 알림이 없습니다
              </div>
            ) : (
              notifications.map((notification) => {
                const Icon = TYPE_ICONS[notification.type] ?? Bell;
                const colorClass = TYPE_COLORS[notification.type] ?? "text-slate-500 bg-slate-50";

                return (
                  <button
                    key={notification.id}
                    onClick={() => handleClickItem(notification)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-b-0 ${
                      !notification.is_read ? "bg-brand-50/30" : ""
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 mt-0.5 h-8 w-8 rounded-xl flex items-center justify-center ${colorClass}`}
                    >
                      <Icon size={16} weight="fill" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm leading-snug ${
                          !notification.is_read
                            ? "font-semibold text-slate-800"
                            : "text-slate-600"
                        }`}
                      >
                        {notification.title}
                      </p>
                      {notification.body && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {notification.body}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-300 mt-1">
                        {formatTimeAgo(notification.created_at)}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <div className="flex-shrink-0 mt-2 h-2 w-2 rounded-full bg-brand-500" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
