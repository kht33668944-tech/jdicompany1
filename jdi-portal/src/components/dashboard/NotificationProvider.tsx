"use client";

import { useEffect, useCallback } from "react";
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
  const handleNewNotification = useCallback(
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
          handleNewNotification(payload.new as Notification);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, handleNewNotification]);

  return <>{children}</>;
}
