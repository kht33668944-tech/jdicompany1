"use client";

import {
  Archive,
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  Clock,
  Flag,
  FolderSimple,
  PencilSimple,
  Plus,
  Trash,
  UserSwitch,
} from "phosphor-react";
import { describeActivity, type ActivityIconKey } from "@/lib/activity/format";
import type { ActivityLogEntry } from "@/lib/activity/types";
import { formatTime } from "@/lib/utils/date";

const ICONS: Record<ActivityIconKey, React.ComponentType<{ size?: number }>> = {
  create: Plus,
  delete: Trash,
  done: CheckCircle,
  status: ArrowRight,
  due: Clock,
  assignee: UserSwitch,
  priority: Flag,
  edit: PencilSimple,
  schedule: CalendarBlank,
  project: FolderSimple,
  archive: Archive,
};

const TONES: Record<ActivityIconKey, string> = {
  create: "bg-slate-100 text-slate-600",
  delete: "bg-rose-100 text-rose-600",
  done: "bg-emerald-100 text-emerald-600",
  status: "bg-amber-100 text-amber-600",
  due: "bg-orange-100 text-orange-600",
  assignee: "bg-purple-100 text-purple-600",
  priority: "bg-red-100 text-red-600",
  edit: "bg-slate-100 text-slate-500",
  schedule: "bg-indigo-100 text-indigo-600",
  project: "bg-blue-100 text-blue-600",
  archive: "bg-slate-200 text-slate-600",
};

/**
 * 활동 한 줄. 대시보드 카드와 전체 보기 페이지가 함께 쓴다.
 *
 * 최상위가 <span> 인 이유: 묶음 토글 <button> 안에도 들어가는데
 * button 안에는 phrasing content 만 유효하기 때문이다.
 */
export default function ActivityRow({
  entry,
  indented,
}: {
  entry: ActivityLogEntry;
  indented?: boolean;
}) {
  const { iconKey, text } = describeActivity(entry);
  const Icon = ICONS[iconKey];

  return (
    <span className={`flex items-start gap-3 px-5 py-3 ${indented ? "pl-14" : ""}`}>
      <span className="w-10 shrink-0 pt-0.5 text-xs font-bold tabular-nums text-slate-400">
        {formatTime(entry.created_at)}
      </span>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${TONES[iconKey]}`}
      >
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1 break-words text-sm text-slate-600">
        <span className="font-bold text-slate-800">{entry.actor_name}</span> {text}
      </span>
    </span>
  );
}
