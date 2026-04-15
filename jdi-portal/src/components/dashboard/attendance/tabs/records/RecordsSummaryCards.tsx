"use client";

import { Briefcase, ClockAfternoon, Scales, Warning } from "phosphor-react";
import type { AttendanceStats } from "@/lib/attendance/stats";
import { formatMinutes, formatSignedMinutes } from "@/lib/utils/date";

interface RecordsSummaryCardsProps {
  stats: AttendanceStats;
  prevStats: AttendanceStats | null;
}

export default function RecordsSummaryCards({ stats, prevStats }: RecordsSummaryCardsProps) {
  const daysDiff = prevStats ? stats.totalDays - prevStats.totalDays : null;
  const lateTimeDiff = prevStats ? stats.avgLateMinutes - prevStats.avgLateMinutes : null;

  const diffLabel = formatSignedMinutes(stats.totalDiffMinutes);
  const diffIsPositive = stats.totalDiffMinutes > 0;
  const diffIsZero = stats.totalDiffMinutes === 0;

  const cards = [
    {
      label: "총 근무일수",
      value: `${stats.totalDays}`,
      unit: "일",
      diff: daysDiff !== null ? `전월 대비 ${Math.abs(daysDiff)}건 ${daysDiff >= 0 ? "증가" : "감소"}` : null,
      diffPositive: daysDiff !== null ? daysDiff >= 0 : null,
      icon: Briefcase,
      iconColor: "text-brand-500",
    },
    {
      label: "평균 근무시간",
      value: formatMinutes(stats.avgWorkMinutes).replace("시간", "h ").replace("분", "m"),
      unit: "",
      diff: null,
      diffPositive: null,
      icon: ClockAfternoon,
      iconColor: "text-emerald-500",
      valueColor: null as string | null,
    },
    {
      label: "누적 초과/부족",
      value: diffLabel,
      unit: "",
      diff: null,
      diffPositive: null,
      icon: Scales,
      iconColor: diffIsZero ? "text-slate-400" : diffIsPositive ? "text-emerald-500" : "text-red-500",
      valueColor: diffIsZero ? "text-slate-600" : diffIsPositive ? "text-emerald-600" : "text-red-600",
    },
    {
      label: "평균 지각시간",
      value: `${stats.avgLateMinutes}`,
      unit: "분",
      diff: lateTimeDiff !== null && lateTimeDiff !== 0
        ? `전월 대비 ${Math.abs(lateTimeDiff)}분 ${lateTimeDiff > 0 ? "증가" : "감소"}`
        : null,
      diffPositive: lateTimeDiff !== null ? lateTimeDiff <= 0 : null,
      icon: Warning,
      iconColor: "text-amber-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">{card.label}</span>
              <Icon size={18} className={card.iconColor} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold ${("valueColor" in card && card.valueColor) || "text-slate-800"}`}>{card.value}</span>
              {card.unit && <span className="text-sm text-slate-500">{card.unit}</span>}
            </div>
            {card.diff && (
              <p className={`text-xs mt-1 ${card.diffPositive ? "text-brand-600" : "text-red-500"}`}>
                {card.diffPositive ? "▲" : "▼"} {card.diff}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
