"use client";

import { useMemo } from "react";
import type { Influencer, InfluencerCampaign, CampaignStatus } from "@/lib/influencer/types";
import type { FilterState } from "./InfluencerFilters";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/influencer/labels";

interface Props {
  influencers: Influencer[];
  activeCampaigns: InfluencerCampaign[];
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
}

type StepKey = "noCampaign" | CampaignStatus;

interface Step {
  key: StepKey;
  icon: string;
  label: string;
  dot: string;
  activeBg: string;
  activeRing: string;
  unit: "명" | "건";
}

const STEPS: Step[] = [
  { key: "noCampaign", icon: "⏳", label: "대기", dot: "bg-slate-400", activeBg: "bg-slate-50", activeRing: "ring-slate-200", unit: "명" },
  { key: "planned", icon: "🤝", label: CAMPAIGN_STATUS_LABEL.planned, dot: "bg-slate-500", activeBg: "bg-slate-50", activeRing: "ring-slate-300", unit: "건" },
  { key: "dm_sent", icon: "📩", label: CAMPAIGN_STATUS_LABEL.dm_sent, dot: "bg-blue-500", activeBg: "bg-blue-50", activeRing: "ring-blue-200", unit: "건" },
  { key: "replied", icon: "✉️", label: CAMPAIGN_STATUS_LABEL.replied, dot: "bg-cyan-500", activeBg: "bg-cyan-50", activeRing: "ring-cyan-200", unit: "건" },
  { key: "shipped", icon: "📦", label: CAMPAIGN_STATUS_LABEL.shipped, dot: "bg-amber-500", activeBg: "bg-amber-50", activeRing: "ring-amber-200", unit: "건" },
  { key: "posted", icon: "📸", label: CAMPAIGN_STATUS_LABEL.posted, dot: "bg-violet-500", activeBg: "bg-violet-50", activeRing: "ring-violet-200", unit: "건" },
  { key: "done", icon: "✅", label: CAMPAIGN_STATUS_LABEL.done, dot: "bg-emerald-500", activeBg: "bg-emerald-50", activeRing: "ring-emerald-200", unit: "건" },
];

export default function SeedingFunnel({ influencers, activeCampaigns, filters, onFiltersChange }: Props) {
  const campaignMap = useMemo(() => {
    const map = new Map<string, InfluencerCampaign>();
    for (const c of activeCampaigns) map.set(c.influencer_id, c);
    return map;
  }, [activeCampaigns]);

  const stepCounts = useMemo(() => {
    const noCampaign = influencers.filter((i) => !campaignMap.has(i.id)).length;
    const statusCounts: Record<CampaignStatus, number> = {
      planned: 0, dm_sent: 0, replied: 0, shipped: 0, posted: 0, done: 0,
    };
    for (const c of activeCampaigns) statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
    return STEPS.map((s) => (s.key === "noCampaign" ? noCampaign : statusCounts[s.key as CampaignStatus]));
  }, [influencers, activeCampaigns, campaignMap]);

  function isActive(key: StepKey): boolean {
    if (key === "noCampaign") return filters.noCampaign;
    return filters.campaignStatuses.includes(key as CampaignStatus);
  }

  function handleClick(key: StepKey) {
    if (key === "noCampaign") {
      onFiltersChange({ ...filters, noCampaign: !filters.noCampaign });
      return;
    }
    const status = key as CampaignStatus;
    const next = filters.campaignStatuses.includes(status)
      ? filters.campaignStatuses.filter((s) => s !== status)
      : [...filters.campaignStatuses, status];
    onFiltersChange({ ...filters, campaignStatuses: next });
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">시딩 진행현황</h3>
        <span className="text-[11px] text-slate-400 tabular-nums">
          {influencers.length}명 · {activeCampaigns.length}건
        </span>
      </div>

      {/* 단계 목록 */}
      <div className="flex flex-col gap-0.5">
        {STEPS.map((step, idx) => {
          const count = stepCounts[idx];
          const active = isActive(step.key);
          const isEmpty = count === 0;

          return (
            <button
              key={step.key}
              type="button"
              onClick={() => handleClick(step.key)}
              aria-pressed={active}
              className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${
                active ? `${step.activeBg} ring-1 ${step.activeRing}` : "hover:bg-slate-50"
              }`}
            >
              <span className="w-6 text-base leading-none" aria-hidden>{step.icon}</span>
              <span className={`flex-1 text-sm text-left truncate ${isEmpty ? "text-slate-400" : "text-slate-700 font-medium"}`}>
                {step.label}
              </span>
              <span className="flex items-baseline gap-0.5 tabular-nums">
                <span className={`text-lg font-bold tracking-tight ${isEmpty ? "text-slate-300" : "text-slate-900"}`}>
                  {count}
                </span>
                <span className={`text-[10px] ${isEmpty ? "text-slate-300" : "text-slate-400"}`}>
                  {step.unit}
                </span>
              </span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isEmpty ? "border border-slate-300 bg-transparent" : step.dot
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
