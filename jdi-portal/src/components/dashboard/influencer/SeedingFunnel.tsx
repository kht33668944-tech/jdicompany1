"use client";

import { useMemo } from "react";
import type { CampaignBasic, CampaignStatus } from "@/lib/influencer/types";
import type { FilterState } from "./InfluencerFilters";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/influencer/labels";

interface Props {
  /**
   * 완료까지 포함한 전체 캠페인.
   * 예전에는 '진행 중'만 받아서 세는 바람에 마지막 '완료' 칸이 구조적으로 늘 0이었다.
   */
  allCampaigns: CampaignBasic[];
  /** 전체 활성 인플루언서 수 — '대기'는 화면에 불러온 25명이 아니라 전체 기준이어야 한다 */
  totalInfluencerCount: number;
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

export default function SeedingFunnel({
  allCampaigns,
  totalInfluencerCount,
  filters,
  onFiltersChange,
}: Props) {
  const stepCounts = useMemo(() => {
    // '대기'는 전체 인플루언서에서 캠페인이 하나라도 있는 사람을 뺀 수.
    // (보관된 인플루언서의 옛 캠페인이 섞일 수 있어 음수 방지로 0에서 자른다)
    const withCampaign = new Set(allCampaigns.map((c) => c.influencer_id));
    const noCampaign = Math.max(0, totalInfluencerCount - withCampaign.size);
    const statusCounts: Record<CampaignStatus, number> = {
      planned: 0, dm_sent: 0, replied: 0, shipped: 0, posted: 0, done: 0,
    };
    for (const c of allCampaigns) statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
    return STEPS.map((s) => (s.key === "noCampaign" ? noCampaign : statusCounts[s.key as CampaignStatus]));
  }, [allCampaigns, totalInfluencerCount]);

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
  );
}
