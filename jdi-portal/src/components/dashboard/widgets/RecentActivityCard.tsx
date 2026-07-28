"use client";

import { useState } from "react";
import Link from "next/link";
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
import {
  activityHref,
  describeActivity,
  groupActivities,
  type ActivityIconKey,
} from "@/lib/activity/format";
import type { ActivityLogEntry } from "@/lib/activity/types";
import { formatTime } from "@/lib/utils/date";

interface Props {
  activities: ActivityLogEntry[];
}

const COLLAPSED_COUNT = 8;

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
 * 한 줄. 묶음 토글 <button> 안에도 들어가므로 블록 요소(div/p)를 쓰지 않는다
 * (button 안에는 phrasing content 만 유효하다).
 */
function ActivityRow({ entry, indented }: { entry: ActivityLogEntry; indented?: boolean }) {
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

export default function RecentActivityCard({ activities }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // 같은 사람이 같은 대상을 5분 안에 연달아 건드린 기록은 한 줄로 묶는다.
  const groups = groupActivities(activities);
  const visible = showAll ? groups : groups.slice(0, COLLAPSED_COUNT);
  const hiddenCount = groups.length - visible.length;

  return (
    <section className="overflow-hidden rounded-lg bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-base font-bold text-slate-800">최근 활동</h3>
          <p className="mt-1 text-xs text-slate-400">오늘 직원들이 한 일을 시간순으로 보여줍니다.</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400">오늘은 아직 활동이 없습니다</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {visible.map((group) => {
            const href = activityHref(group.head);

            // 묶인 기록: 대표 줄을 누르면 펼쳐진다(링크 대신 토글).
            if (group.entries.length > 1) {
              const expanded = expandedKey === group.key;
              return (
                <div key={group.key}>
                  <button
                    type="button"
                    onClick={() => setExpandedKey(expanded ? null : group.key)}
                    className="flex w-full items-center gap-2 text-left transition-colors hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <ActivityRow entry={group.head} />
                    </span>
                    <span className="shrink-0 pr-5 text-xs font-bold text-slate-400">
                      {expanded ? "접기" : `+${group.entries.length - 1}건`}
                    </span>
                  </button>

                  {expanded && (
                    <div className="bg-slate-50/60">
                      {group.entries.slice(1).map((entry) => {
                        const entryHref = activityHref(entry);
                        return entryHref ? (
                          <Link
                            key={entry.id}
                            href={entryHref}
                            className="block transition-colors hover:bg-slate-100"
                          >
                            <ActivityRow entry={entry} indented />
                          </Link>
                        ) : (
                          <div key={entry.id} className="opacity-60">
                            <ActivityRow entry={entry} indented />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // 삭제된 항목은 갈 곳이 없으므로 링크 없이 흐리게 둔다.
            if (!href) {
              return (
                <div key={group.key} className="opacity-60">
                  <ActivityRow entry={group.head} />
                </div>
              );
            }

            return (
              <Link
                key={group.key}
                href={href}
                className="block transition-colors hover:bg-slate-50"
              >
                <ActivityRow entry={group.head} />
              </Link>
            );
          })}
        </div>
      )}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full border-t border-slate-100 px-5 py-3 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50"
        >
          더보기 ({hiddenCount}건)
        </button>
      )}
    </section>
  );
}
