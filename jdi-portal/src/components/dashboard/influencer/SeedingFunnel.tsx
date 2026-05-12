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
  label: string;
  barColor: string;
  activeClasses: string;
}

const STEPS: Step[] = [
  {
    key: "noCampaign",
    label: "대기 (캠페인 없음)",
    barColor: "bg-slate-400",
    activeClasses: "bg-slate-50 ring-1 ring-slate-200",
  },
  {
    key: "planned",
    label: CAMPAIGN_STATUS_LABEL.planned,
    barColor: "bg-slate-500",
    activeClasses: "bg-slate-50 ring-1 ring-slate-200",
  },
  {
    key: "dm_sent",
    label: CAMPAIGN_STATUS_LABEL.dm_sent,
    barColor: "bg-blue-400",
    activeClasses: "bg-blue-50 ring-1 ring-blue-200",
  },
  {
    key: "replied",
    label: CAMPAIGN_STATUS_LABEL.replied,
    barColor: "bg-cyan-400",
    activeClasses: "bg-cyan-50 ring-1 ring-cyan-200",
  },
  {
    key: "shipped",
    label: CAMPAIGN_STATUS_LABEL.shipped,
    barColor: "bg-amber-400",
    activeClasses: "bg-amber-50 ring-1 ring-amber-200",
  },
  {
    key: "posted",
    label: CAMPAIGN_STATUS_LABEL.posted,
    barColor: "bg-violet-400",
    activeClasses: "bg-violet-50 ring-1 ring-violet-200",
  },
  {
    key: "done",
    label: CAMPAIGN_STATUS_LABEL.done,
    barColor: "bg-emerald-400",
    activeClasses: "bg-emerald-50 ring-1 ring-emerald-200",
  },
];

function rateColor(rate: number): string {
  if (rate < 30) return "text-rose-500";
  if (rate >= 70) return "text-emerald-500";
  return "text-slate-400";
}

export default function SeedingFunnel({ influencers, activeCampaigns, filters, onFiltersChange }: Props) {
  const campaignMap = useMemo(() => {
    const map = new Map<string, InfluencerCampaign>();
    for (const c of activeCampaigns) {
      map.set(c.influencer_id, c);
    }
    return map;
  }, [activeCampaigns]);

  const counts = useMemo(() => {
    const noCampaign = influencers.filter((i) => !campaignMap.has(i.id)).length;
    const statusCounts: Record<CampaignStatus, number> = {
      planned: 0,
      dm_sent: 0,
      replied: 0,
      shipped: 0,
      posted: 0,
      done: 0,
    };
    for (const c of activeCampaigns) {
      statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
    }
    return { noCampaign, ...statusCounts };
  }, [influencers, activeCampaigns, campaignMap]);

  const stepCounts = useMemo(
    () =>
      STEPS.map((s) =>
        s.key === "noCampaign" ? counts.noCampaign : counts[s.key as CampaignStatus]
      ),
    [counts]
  );

  const maxCount = useMemo(() => Math.max(...stepCounts, 1), [stepCounts]);

  function isActive(key: StepKey): boolean {
    if (key === "noCampaign") return filters.noCampaign;
    return filters.campaignStatuses.includes(key as CampaignStatus);
  }

  function handleClick(key: StepKey) {
    if (key === "noCampaign") {
      onFiltersChange({ ...filters, noCampaign: !filters.noCampaign });
    } else {
      const status = key as CampaignStatus;
      const next = filters.campaignStatuses.includes(status)
        ? filters.campaignStatuses.filter((s) => s !== status)
        : [...filters.campaignStatuses, status];
      onFiltersChange({ ...filters, campaignStatuses: next });
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 sm:p-5 flex flex-col gap-1">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          📊 시딩 깔때기
        </h3>
        <span className="text-[11px] text-slate-400 tabular-nums">
          {influencers.length}명 / {activeCampaigns.length}건
        </span>
      </div>

      {STEPS.map((step, idx) => {
        const count = stepCounts[idx];
        const active = isActive(step.key);
        const prevCount = idx > 0 ? stepCounts[idx - 1] : null;

        return (
          <div key={step.key} className="flex flex-col">
            {idx > 0 && (
              <div className="flex items-center justify-center gap-1 py-0.5">
                <span className="text-[10px] text-slate-300">↓</span>
                {prevCount !== null && prevCount > 0 ? (
                  <span className={`text-[10px] tabular-nums ${rateColor((count / prevCount) * 100)}`}>
                    {((count / prevCount) * 100).toFixed(0)}%
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-300">—</span>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => handleClick(step.key)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                active ? step.activeClasses : "hover:bg-slate-50"
              } ${count === 0 ? "opacity-40" : ""}`}
            >
              <span className="text-xs font-medium text-slate-700 w-24 truncate text-left">
                {step.label}
              </span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${step.barColor}`}
                  style={{ width: `${count > 0 ? Math.max((count / maxCount) * 100, 4) : 0}%` }}
                />
              </div>
              <span className="text-xs font-bold tabular-nums w-10 text-right text-slate-700">
                {count}{step.key === "noCampaign" ? "명" : "건"}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
