"use client";

import { CheckCircle, ClockClockwise, ListChecks, WarningCircle } from "phosphor-react";
import type { TaskSummary } from "@/lib/tasks/types";

interface Props {
  summary: TaskSummary;
}

const cards = [
  {
    key: "total" as const,
    label: "전체 할 일",
    icon: ListChecks,
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    getValue: (summary: TaskSummary) => summary.total,
    textColor: "",
    border: "",
  },
  {
    key: "inProgress" as const,
    label: "진행중",
    icon: ClockClockwise,
    iconBg: "bg-orange-50",
    iconColor: "text-orange-600",
    getValue: (summary: TaskSummary) => summary.by_status["진행중"],
    textColor: "",
    border: "",
  },
  {
    key: "done" as const,
    label: "완료",
    icon: CheckCircle,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    getValue: (summary: TaskSummary) => summary.by_status["완료"],
    textColor: "",
    border: "",
  },
  {
    key: "overdue" as const,
    label: "지연됨",
    icon: WarningCircle,
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    getValue: (summary: TaskSummary) => summary.overdue,
    textColor: "text-red-600",
    border: "border border-red-100",
  },
];

export default function TaskSummaryPanel({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = card.getValue(summary);
        return (
          <div
            key={card.key}
            className={`flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm lg:gap-5 lg:p-6 ${card.border}`}
          >
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl lg:h-12 lg:w-12 ${card.iconBg} ${card.iconColor}`}
            >
              <Icon size={24} />
            </div>
            <div>
              <p className={`text-sm font-medium ${card.textColor ? "text-red-400" : "text-slate-400"}`}>
                {card.label}
              </p>
              <p className={`text-xl font-bold lg:text-2xl ${card.textColor}`}>{value}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
