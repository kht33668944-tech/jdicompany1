"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarBlank, SpinnerGap } from "phosphor-react";
import { activityDateLabel, activityHref } from "@/lib/activity/format";
import type { ActivityLogEntry } from "@/lib/activity/types";
import { toDateStringFromTimestamp } from "@/lib/utils/date";
import ActivityRow from "./ActivityRow";

interface Props {
  /** KST 오늘 */
  today: string;
  /** 보관 기간(7일) 중 가장 오래된 날 — 달력에서 이보다 이전은 고를 수 없다 */
  earliest: string;
  /** 서버에서 미리 실어 보낸 오늘 활동 */
  initialActivities: ActivityLogEntry[];
}

const inputClass =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export default function ActivityPageClient({ today, earliest, initialActivities }: Props) {
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  /** 보관 기간 전체. 아직 안 받았으면 null (그동안은 서버가 준 오늘 것만 쓴다) */
  const [allActivities, setAllActivities] = useState<ActivityLogEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // 화면이 뜬 직후 나머지 날짜를 뒤에서 받아둔다.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/activity")
      .then((response) => {
        if (!response.ok) throw new Error(`활동을 불러오지 못했습니다 (${response.status})`);
        return response.json();
      })
      .then((data: { activities: ActivityLogEntry[] }) => {
        if (!cancelled) setAllActivities(data.activities ?? []);
      })
      .catch((error) => {
        console.error("[activity] 기간 전체 로딩 실패:", error);
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 아직 전체를 못 받았고 오늘만 보고 있다면 서버가 준 데이터로 충분하다.
  const onlyToday = start === today && end === today;
  const waitingForRange = allActivities === null && !onlyToday && !loadFailed;

  const sections = useMemo(() => {
    const source =
      allActivities ?? (start === today && end === today ? initialActivities : []);
    const visible = source.filter((entry) => {
      const date = toDateStringFromTimestamp(entry.created_at);
      return date >= start && date <= end;
    });

    const byDate = new Map<string, ActivityLogEntry[]>();
    for (const entry of visible) {
      const date = toDateStringFromTimestamp(entry.created_at);
      const bucket = byDate.get(date);
      if (bucket) bucket.push(entry);
      else byDate.set(date, [entry]);
    }

    // 전체 보기에서는 묶지 않고 모두 펼쳐서 보여준다(카드와 다른 점).
    return Array.from(byDate.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, entries]) => ({
        date,
        label: activityDateLabel(date, today),
        entries,
      }));
  }, [allActivities, initialActivities, start, end, today]);

  const totalCount = sections.reduce((sum, section) => sum + section.entries.length, 0);

  // 시작일이 종료일보다 뒤로 가지 않게 잡아준다.
  function handleStart(value: string) {
    setStart(value);
    if (value > end) setEnd(value);
  }
  function handleEnd(value: string) {
    setEnd(value);
    if (value < start) setStart(value);
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-700"
        >
          <ArrowLeft size={16} />
          대시보드
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-800">최근 활동</h1>
        <p className="mt-1 text-sm text-slate-400">
          직원들이 한 일을 시간순으로 봅니다. 기록은 7일간 보관됩니다.
        </p>
      </div>

      <section className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarBlank size={16} className="shrink-0 text-slate-400" />
            <input
              type="date"
              value={start}
              min={earliest}
              max={today}
              onChange={(event) => handleStart(event.target.value)}
              className={inputClass}
              aria-label="시작일"
            />
            <span className="text-sm text-slate-400">~</span>
            <input
              type="date"
              value={end}
              min={earliest}
              max={today}
              onChange={(event) => handleEnd(event.target.value)}
              className={inputClass}
              aria-label="종료일"
            />
          </div>
          <p className="text-xs font-semibold text-slate-500">
            {waitingForRange ? "불러오는 중…" : `${totalCount}건`}
          </p>
        </div>

        {waitingForRange ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-slate-400">
            <SpinnerGap size={18} className="animate-spin" />
            활동을 불러오는 중입니다
          </div>
        ) : loadFailed && !onlyToday ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">
            활동을 불러오지 못했습니다. 새로고침해 주세요.
          </div>
        ) : sections.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">
            이 기간에는 활동이 없습니다
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.date}>
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-2">
                <h2 className="text-xs font-bold text-slate-600">{section.label}</h2>
                <span className="text-xs text-slate-400">{section.entries.length}건</span>
              </div>
              <div className="divide-y divide-slate-100">
                {section.entries.map((entry) => {
                  const href = activityHref(entry);
                  return href ? (
                    <Link
                      key={entry.id}
                      href={href}
                      className="block transition-colors hover:bg-slate-50"
                    >
                      <ActivityRow entry={entry} />
                    </Link>
                  ) : (
                    <div key={entry.id} className="opacity-60">
                      <ActivityRow entry={entry} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
