"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Notification } from "@/lib/notifications/types";

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
    },
    [onNewNotification]
  );

  // 5초마다 새 알림 폴링
  useEffect(() => {
    const supabase = createClient();

    const poll = async () => {
      const since = lastCheckedRef.current;
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .gt("created_at", since)
        .order("created_at", { ascending: true });

      if (data && data.length > 0) {
        const notifications = data as Notification[];
        lastCheckedRef.current = notifications[notifications.length - 1].created_at;
        notifications.forEach((n) => showToast(n));
      }
    };

    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [userId, showToast]);

  return <>{children}</>;
}
