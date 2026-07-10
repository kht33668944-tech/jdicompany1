"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const WARMUP_ROUTES = [
  "/dashboard/chat",
  "/dashboard/tasks",
  "/dashboard/work-timeline",
  "/dashboard/schedule",
  "/dashboard/attendance",
  "/dashboard/influencer",
  "/dashboard/reports",
  "/dashboard/settings",
];

export default function DashboardWarmup() {
  const router = useRouter();

  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    const startWarmup = () => {
      WARMUP_ROUTES.forEach((route, index) => {
        timers.push(
          setTimeout(() => {
            router.prefetch(route);
          }, index * 350)
        );
      });
    };

    const idleCallback = window.requestIdleCallback?.(() => startWarmup(), {
      timeout: 1500,
    });

    if (!idleCallback) {
      timers.push(setTimeout(startWarmup, 1200));
    }

    return () => {
      if (idleCallback) window.cancelIdleCallback?.(idleCallback);
      timers.forEach(clearTimeout);
    };
  }, [router]);

  return null;
}
