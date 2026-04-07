"use client";

import { useEffect, useCallback } from "react";
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

  // Realtime 구독: 본인 알림 INSERT 즉시 처리 (폴링 제거)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notification = payload.new as Notification;
          showToast(notification);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, showToast]);

  return <>{children}</>;
}
