"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import InfluencerTabs from "./InfluencerTabs";
import SeedingCalendar from "./SeedingCalendar";
import SeedingCampaignBoard from "./SeedingCampaignBoard";
import type { InfluencerCampaignWithInfluencer } from "@/lib/influencer/types";

interface Props {
  activeCampaigns: InfluencerCampaignWithInfluencer[];
}

export default function SeedingSchedulePage({ activeCampaigns }: Props) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  return (
    <div className="flex flex-col gap-4 p-6 min-h-0">
      {/* 탭 네비게이션 */}
      <InfluencerTabs />

      {/* 메인 레이아웃: 캘린더 + 캠페인 보드 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
        <SeedingCalendar
          campaigns={activeCampaigns}
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
        />
        <SeedingCampaignBoard
          campaigns={activeCampaigns}
          selectedDate={selectedDate}
          onRefresh={handleRefresh}
        />
      </div>
    </div>
  );
}
