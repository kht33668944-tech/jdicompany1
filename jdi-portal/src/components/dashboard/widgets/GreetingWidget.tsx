"use client";

import { useState, useEffect } from "react";

interface GreetingWidgetProps {
  name: string;
}

export default function GreetingWidget({ name }: GreetingWidgetProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dateStr = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const timeStr = now.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const hour = now.getHours();
  const greeting = hour < 12 ? "좋은 아침이에요" : hour < 18 ? "좋은 오후에요" : "수고하셨습니다";

  return (
    <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-600 p-6 text-white shadow-lg shadow-brand-500/20">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-brand-100 text-sm font-medium mb-1">{greeting}</p>
          <h2 className="text-2xl font-bold">
            안녕하세요, {name}님!
          </h2>
          <p className="text-brand-200 text-sm mt-1">{dateStr}</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold tabular-nums tracking-tight">{timeStr}</p>
        </div>
      </div>
    </div>
  );
}
