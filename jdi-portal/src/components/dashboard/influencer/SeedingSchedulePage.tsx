"use client";

import { useState, useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import InfluencerTabs from "./InfluencerTabs";
import SeedingCalendar from "./SeedingCalendar";
import SeedingCampaignBoard from "./SeedingCampaignBoard";
import InfluencerDetailPanel from "./InfluencerDetailPanel";
import type { InfluencerCampaignWithInfluencer } from "@/lib/influencer/types";
import type { ContractListSummary } from "@/lib/influencer/contracts/types";

interface Props {
  activeCampaigns: InfluencerCampaignWithInfluencer[];
  /** 리스트 탭과 같은 계약 요약 — 상태를 계약 10단계로 통일하기 위해 필요하다 */
  contractSummaries: ContractListSummary[];
}

export default function SeedingSchedulePage({ activeCampaigns, contractSummaries }: Props) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const contractByInfluencer = useMemo(() => {
    const map = new Map<string, ContractListSummary>();
    for (const summary of contractSummaries) map.set(summary.influencer_id, summary);
    return map;
  }, [contractSummaries]);

  const handleRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  return (
    <div className="flex flex-col gap-3 sm:gap-4 p-3 sm:p-6 min-h-0">
      {/* 탭 네비게이션 */}
      <InfluencerTabs />

      {/* 메인 레이아웃: 캘린더 + 캠페인 보드 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
        <SeedingCalendar
          campaigns={activeCampaigns}
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
          onCampaignClick={(influencerId) => setSelectedInfluencerId(influencerId)}
          onRefresh={handleRefresh}
        />
        <SeedingCampaignBoard
          campaigns={activeCampaigns}
          contractByInfluencer={contractByInfluencer}
          selectedDate={selectedDate}
          onRefresh={handleRefresh}
          onInfluencerClick={(influencerId) => setSelectedInfluencerId(influencerId)}
        />
      </div>

      {/* 인플루언서 상세 패널 (우측 슬라이드) */}
      <InfluencerDetailPanel
        influencerId={selectedInfluencerId}
        contract={selectedInfluencerId ? contractByInfluencer.get(selectedInfluencerId) : undefined}
        onClose={() => setSelectedInfluencerId(null)}
      />
    </div>
  );
}
