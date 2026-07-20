"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Profile } from "@/lib/attendance/types";
import { createClient } from "@/lib/supabase/client";
import { toDateString } from "@/lib/utils/date";
import {
  getWorkTimelineAttachments,
  getWorkTimelineEntries,
  getWorkTimelineProfiles,
  groupAttachmentsByEntry,
} from "@/lib/work-timeline/queries";
import {
  cacheWorkTimeline,
  getCachedWorkTimeline,
} from "@/lib/work-timeline/timelineCache";
import type {
  WorkTimelineEntryWithProfile,
  WorkTimelineProfile,
} from "@/lib/work-timeline/types";

const WorkTimelineSection = dynamic(
  () => import("./work-timeline/WorkTimelineSection"),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-24 animate-pulse rounded-xl border border-slate-100 bg-slate-50/60"
        aria-label="업무 타임라인을 불러오는 중"
        aria-busy="true"
      />
    ),
  },
);

interface DashboardTimelineClientProps {
  currentUserId: string;
  currentUserRole: Profile["role"];
}

interface TimelineData {
  entries: WorkTimelineEntryWithProfile[];
  profiles: WorkTimelineProfile[];
}

export default function DashboardTimelineClient({
  currentUserId,
  currentUserRole,
}: DashboardTimelineClientProps) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    const loadTimeline = async () => {
      let cached: TimelineData | null = null;

      try {
        // 대시보드 미리보기는 오늘(KST) 완료한 업무만 보여준다.
        // 과거 전체는 "전체 보기"에서 확인한다(목록이 커져도 미리보기는 가볍게 유지).
        const today = toDateString();
        // 네트워크 fetch를 먼저 시작해 IndexedDB 캐시 읽기와 겹치게 한다.
        const supabase = createClient();
        const freshPromise = Promise.all([
          getWorkTimelineEntries(supabase, {
            date: today,
            limit: 50,
            includeAttachments: false,
          }),
          getWorkTimelineProfiles(supabase),
        ]);

        cached = await getCachedWorkTimeline(currentUserId, today);
        if (!active) return;
        if (cached) setData(cached);

        const [entries, profiles] = await freshPromise;
        if (!active) return;

        setData({ entries, profiles });
        void cacheWorkTimeline(currentUserId, entries, profiles, today);

        // 본문을 먼저 보여준 뒤 썸네일 첨부를 별도로 하이드레이션한다.
        // (signed URL 은 만료되므로 캐시에 저장하지 않고 매번 새로 가져온다)
        if (entries.length === 0) return;
        try {
          const attachments = await getWorkTimelineAttachments(
            supabase,
            entries.map((entry) => entry.id),
            { thumbnailOnly: true },
          );
          if (!active) return;
          const byEntry = groupAttachmentsByEntry(attachments);
          setData({
            entries: entries.map((entry) => ({
              ...entry,
              attachments: byEntry.get(entry.id) ?? [],
            })),
            profiles,
          });
        } catch (error) {
          console.warn("[dashboard] timeline attachment preview failed:", error);
        }
      } catch (error) {
        console.error("[dashboard] work timeline refresh failed:", error);
        if (active && !cached) setLoadFailed(true);
      }
    };

    void loadTimeline();
    return () => {
      active = false;
    };
  }, [currentUserId, reloadToken]);

  if (!data) {
    return (
      <div
        className="flex h-24 items-center justify-center rounded-xl border border-slate-100 bg-slate-50/60"
        aria-label="업무 타임라인을 불러오는 중"
        aria-busy={!loadFailed}
      >
        {loadFailed ? (
          <button
            type="button"
            onClick={() => {
              setLoadFailed(false);
              setReloadToken((current) => current + 1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            타임라인 다시 불러오기
          </button>
        ) : (
          <span className="text-xs text-slate-400">최근 업무를 불러오는 중입니다.</span>
        )}
      </div>
    );
  }

  return (
    <WorkTimelineSection
      initialEntries={data.entries}
      profiles={data.profiles}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      compact
      // 미리보기에서 업무를 추가한 뒤 재조회할 때도 오늘 기준을 유지한다.
      initialDate={toDateString()}
    />
  );
}
