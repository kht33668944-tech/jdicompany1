"use client";

import { useState } from "react";
import Link from "next/link";
import { CaretRight } from "phosphor-react";
import { activityHref, groupActivities } from "@/lib/activity/format";
import type { ActivityLogEntry } from "@/lib/activity/types";
import ActivityRow from "@/components/dashboard/activity/ActivityRow";

interface Props {
  activities: ActivityLogEntry[];
}

const VISIBLE_COUNT = 8;

export default function RecentActivityCard({ activities }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // 같은 사람이 같은 대상을 5분 안에 연달아 건드린 기록은 한 줄로 묶는다.
  // 카드는 8줄까지만 보여주고, 나머지는 전체 보기 페이지에서 본다.
  const visible = groupActivities(activities).slice(0, VISIBLE_COUNT);

  return (
    <section className="overflow-hidden rounded-lg bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-base font-bold text-slate-800">최근 활동</h3>
          <p className="mt-1 text-xs text-slate-400">오늘 직원들이 한 일을 시간순으로 보여줍니다.</p>
        </div>
        <Link
          href="/dashboard/activity"
          className="flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          더보기
          <CaretRight size={12} />
        </Link>
      </div>

      {visible.length === 0 ? (
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
    </section>
  );
}
