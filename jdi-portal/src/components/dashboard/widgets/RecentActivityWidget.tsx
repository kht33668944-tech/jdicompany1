"use client";

import Link from "next/link";
import {
  CheckCircle,
  ChatCircleDots,
  ArrowRight,
  UserSwitch,
  Flag,
  Paperclip,
  PencilSimple,
} from "phosphor-react";
import type { RecentActivity } from "@/lib/dashboard/queries";
import { formatTimeAgo } from "@/lib/utils/date";

interface Props {
  activities: RecentActivity[];
}


type IconConfig = {
  icon: React.ComponentType<{ size?: number }>;
  bg: string;
  text: string;
};

function getIconConfig(activity: RecentActivity): IconConfig {
  const { type, metadata } = activity;

  if (
    type === "status_change" &&
    typeof metadata?.to === "string" &&
    metadata.to === "완료"
  ) {
    return { icon: CheckCircle, bg: "bg-emerald-100", text: "text-emerald-600" };
  }
  if (type === "checklist") {
    return { icon: CheckCircle, bg: "bg-emerald-100", text: "text-emerald-600" };
  }
  if (type === "comment") {
    return { icon: ChatCircleDots, bg: "bg-blue-100", text: "text-blue-600" };
  }
  if (type === "status_change") {
    return { icon: ArrowRight, bg: "bg-amber-100", text: "text-amber-600" };
  }
  if (type === "assignee_change") {
    return { icon: UserSwitch, bg: "bg-purple-100", text: "text-purple-600" };
  }
  if (type === "priority_change") {
    return { icon: Flag, bg: "bg-orange-100", text: "text-orange-600" };
  }
  if (type === "attachment") {
    return { icon: Paperclip, bg: "bg-indigo-100", text: "text-indigo-600" };
  }
  // edit
  return { icon: PencilSimple, bg: "bg-slate-200", text: "text-slate-600" };
}

function getTypeLabel(activity: RecentActivity): string {
  const { type, metadata } = activity;

  if (
    type === "status_change" &&
    typeof metadata?.to === "string" &&
    metadata.to === "완료"
  ) {
    return "할일 완료";
  }
  switch (type) {
    case "comment":
      return "댓글";
    case "status_change":
      return "상태 변경";
    case "assignee_change":
      return "담당자 변경";
    case "priority_change":
      return "우선순위 변경";
    case "attachment":
      return "파일 첨부";
    case "checklist":
      return "체크리스트";
    case "edit":
      return "수정";
    default:
      return "활동";
  }
}

function getDescription(activity: RecentActivity): string {
  const { type, metadata, content, user_name, task_title } = activity;
  const prefix = `${user_name}님이 '${task_title}'를 `;

  if (type === "status_change") {
    if (typeof metadata?.to === "string" && metadata.to === "완료") {
      return `${prefix}완료했습니다`;
    }
    const from = typeof metadata?.from === "string" ? metadata.from : "";
    const to = typeof metadata?.to === "string" ? metadata.to : "";
    return `${prefix}${from} → ${to}`;
  }
  if (type === "comment") {
    const text = content ?? "";
    const truncated = text.length > 30 ? text.slice(0, 30) + "..." : text;
    return truncated;
  }
  if (type === "assignee_change") return `${prefix}담당자를 변경했습니다`;
  if (type === "priority_change") return `${prefix}우선순위를 변경했습니다`;
  if (type === "attachment") return `${prefix}파일을 첨부했습니다`;
  if (type === "checklist") return `${prefix}체크리스트를 수정했습니다`;
  if (type === "edit") return `${prefix}수정했습니다`;
  return prefix;
}

export default function RecentActivityWidget({ activities }: Props) {
  // 댓글 제외 — 주요 활동만 표시
  const displayed = activities
    .filter((a) => a.type !== "comment")
    .slice(0, 6);

  return (
    <div className="bg-white rounded-[24px] shadow-sm p-8">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-800">최근 활동</h3>
        <p className="text-xs text-slate-400 mt-1">실시간 업데이트</p>
      </div>

      {/* Content */}
      {displayed.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">
          최근 활동이 없습니다
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayed.map((activity) => {
            const { icon: Icon, bg, text } = getIconConfig(activity);
            const label = getTypeLabel(activity);
            const description = getDescription(activity);

            return (
              <Link
                key={activity.id}
                href={`/dashboard/tasks/${activity.task_id}`}
                className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors"
              >
                {/* Icon circle */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${bg} ${text}`}
                >
                  <Icon size={20} />
                </div>

                {/* Right content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-700">{label}</p>
                  <p className="text-xs text-slate-500 mt-1 break-words">
                    {description}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-2">
                    {formatTimeAgo(activity.created_at)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
