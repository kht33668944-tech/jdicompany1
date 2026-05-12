"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import InfluencerTabs from "./InfluencerTabs";
import SeedingCalendar from "./SeedingCalendar";
import SeedingCampaignBoard from "./SeedingCampaignBoard";
import InfluencerDetailPanel from "./InfluencerDetailPanel";
import type { InfluencerCampaignWithInfluencer } from "@/lib/influencer/types";

interface Props {
  activeCampaigns: InfluencerCampaignWithInfluencer[];
}

export default function SeedingSchedulePage({ activeCampaigns }: Props) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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
          selectedDate={selectedDate}
          onRefresh={handleRefresh}
          onInfluencerClick={(influencerId) => setSelectedInfluencerId(influencerId)}
        />
      </div>

      {/* 인플루언서 상세 패널 (우측 슬라이드) */}
      <InfluencerDetailPanel
        influencerId={selectedInfluencerId}
        onClose={() => setSelectedInfluencerId(null)}
      />
    </div>
  );
}
