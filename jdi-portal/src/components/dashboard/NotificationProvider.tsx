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

const REALTIME_BOOT_DELAY_MS = 10000;

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

      // 화면 쪽에도 방송 — 대시보드가 이 이벤트를 받아 서버 데이터를 즉시 다시 불러온다
      // (검토 요청·업무지시가 로그아웃 전까지 안 보이던 문제의 해결 지점)
      window.dispatchEvent(new CustomEvent("jdi:notification-received", { detail: notification }));
    },
    [onNewNotification]
  );

  // Realtime 구독: 본인 알림 INSERT 즉시 처리 (폴링 제거)
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const timer = window.setTimeout(() => {
      channel = supabase
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
    }, REALTIME_BOOT_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, showToast]);

  return <>{children}</>;
}
