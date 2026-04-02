"use client";

import {
  ListChecks,
  ClockClockwise,
  WarningCircle,
  CheckCircle,
} from "phosphor-react";
import type { TaskSummary } from "@/lib/tasks/types";

interface Props {
  summary: TaskSummary;
}

const cards = [
  {
    key: "total" as const,
    label: "전체 할일",
    icon: ListChecks,
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    getValue: (s: TaskSummary) => s.total,
    textColor: "",
    border: "",
  },
  {
    key: "inProgress" as const,
    label: "진행중",
    icon: ClockClockwise,
    iconBg: "bg-orange-50",
    iconColor: "text-orange-600",
    getValue: (s: TaskSummary) => s.by_status["진행중"],
    textColor: "",
    border: "",
  },
  {
    key: "overdue" as const,
    label: "지연됨",
    icon: WarningCircle,
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    getValue: (s: TaskSummary) => s.overdue,
    textColor: "text-red-600",
    border: "border border-red-100",
  },
  {
    key: "completedWeek" as const,
    label: "이번주 완료",
    icon: CheckCircle,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    getValue: (s: TaskSummary) => s.completed_this_week,
    textColor: "",
    border: "",
  },
];

export default function TaskSummaryPanel({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = card.getValue(summary);
        return (
          <div
            key={card.key}
            className={`bg-white p-4 lg:p-6 rounded-3xl shadow-sm flex items-center gap-3 lg:gap-5 ${card.border}`}
          >
            <div
              className={`w-10 h-10 lg:w-12 lg:h-12 ${card.iconBg} ${card.iconColor} rounded-2xl flex items-center justify-center`}
            >
              <Icon size={24} />
            </div>
            <div>
              <p className={`text-sm font-medium ${card.textColor ? "text-red-400" : "text-slate-400"}`}>
                {card.label}
              </p>
              <p className={`text-xl lg:text-2xl font-bold ${card.textColor}`}>{value}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
