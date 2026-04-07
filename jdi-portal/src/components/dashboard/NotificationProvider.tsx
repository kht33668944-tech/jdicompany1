"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Notification } from "@/lib/notifications/types";
import { showDesktopNotification } from "@/lib/notifications/desktop";

interface NotificationProviderProps {
  userId: string;
  onNewNotification: () => void;
  children: React.ReactNode;
}

export default function NotificationProvider({
  userId,
  onNewNotification,
  children,
}: NotificationProviderProps) {
  const lastCheckedRef = useRef<string>(new Date().toISOString());

  const showToast = useCallback(
    (notification: Notification) => {
      onNewNotification();
      toast(notification.title, {
        description: notification.body ?? undefined,
        duration: 5000,
        action: notification.link
          ? {
              label: "보기",
              onClick: () => {
                window.location.href = notification.link!;
              },
            }
          : undefined,
      });

      // OS 네이티브 알림도 동시 표시 (권한 없으면 silent no-op)
      showDesktopNotification({
        title: notification.title,
        body: notification.body,
        link: notification.link,
        tag: `notification:${notification.id}`,
      });
    },
    [onNewNotification]
  );

  // 5초마다 새 알림 폴링
  useEffect(() => {
    let aborted = false;
    const supabase = createClient();

    const poll = async () => {
      const since = lastCheckedRef.current;
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .gt("created_at", since)
        .order("created_at", { ascending: true });

      if (!aborted && data && data.length > 0) {
        const notifications = data as Notification[];
        lastCheckedRef.current = notifications[notifications.length - 1].created_at;
        notifications.forEach((n) => showToast(n));
      }
    };

    poll();
    const interval = setInterval(poll, 30_000);
    return () => { aborted = true; clearInterval(interval); };
  }, [userId, showToast]);

  return <>{children}</>;
}
