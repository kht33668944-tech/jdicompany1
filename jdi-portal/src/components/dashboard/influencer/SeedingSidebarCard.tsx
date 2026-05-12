"use client";

import { useState, useMemo } from "react";
import type { Influencer, InfluencerCampaignWithInfluencer } from "@/lib/influencer/types";
import type { FilterState } from "./InfluencerFilters";
import { kstTodayStr } from "@/lib/influencer/calendar";
import SeedingFunnel from "./SeedingFunnel";
import StaleDmList from "./StaleDmList";

interface Props {
  influencers: Influencer[];
  activeCampaigns: InfluencerCampaignWithInfluencer[];
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
  onInfluencerClick: (influencerId: string) => void;
  onRefresh: () => void;
}

function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(fromStr + "T00:00:00Z").getTime();
  const to = new Date(toStr + "T00:00:00Z").getTime();
  return Math.floor((to - from) / (24 * 60 * 60 * 1000));
}

function tabClasses(active: boolean): string {
  return `inline-flex items-center px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
    active ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"
  }`;
}

export default function SeedingSidebarCard({
  influencers,
  activeCampaigns,
  filters,
  onFiltersChange,
  onInfluencerClick,
  onRefresh,
}: Props) {
  const [tab, setTab] = useState<"funnel" | "staleDm">("funnel");

  const today = kstTodayStr();

  const urgentCount = useMemo(() => {
    return activeCampaigns.filter(
      (c) =>
        c.status === "dm_sent" &&
        c.contact_date !== null &&
        daysBetween(c.contact_date, today) >= 5
    ).length;
  }, [activeCampaigns, today]);

  const staleDmTotal = useMemo(() => {
    return activeCampaigns.filter(
      (c) => c.status === "dm_sent" && c.contact_date !== null
    ).length;
  }, [activeCampaigns]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
      {/* 헤더: 탭 + 우측 메타 */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
        {/* 탭 (세그먼트 컨트롤) */}
        <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
          <button onClick={() => setTab("funnel")} className={tabClasses(tab === "funnel")}>
            진행현황
          </button>
          <button onClick={() => setTab("staleDm")} className={tabClasses(tab === "staleDm") + " gap-1"}>
            DM 추적
            {urgentCount > 0 && (
              <span className="text-[9px] font-bold bg-rose-500 text-white rounded-full px-1.5 leading-tight">
                {urgentCount}
              </span>
            )}
          </button>
        </div>
        {/* 우측 요약 (탭별로 다른 텍스트) */}
        <span className="text-[11px] text-slate-400 tabular-nums">
          {tab === "funnel"
            ? `${influencers.length}명 · ${activeCampaigns.length}건`
            : `${staleDmTotal}건`}
        </span>
      </div>
      {/* 본문 */}
      {tab === "funnel" ? (
        <SeedingFunnel
          influencers={influencers}
          activeCampaigns={activeCampaigns}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      ) : (
        <StaleDmList
          campaigns={activeCampaigns}
          onInfluencerClick={onInfluencerClick}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
