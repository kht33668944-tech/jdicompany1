"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import TopUrlBar from "./TopUrlBar";
import KpiCards from "./KpiCards";
import InfluencerTable from "./InfluencerTable";
import InfluencerFilters, { DEFAULT_FILTER_STATE } from "./InfluencerFilters";
import SeedingTimeline from "./SeedingTimeline";
import InfluencerDetailPanel from "./InfluencerDetailPanel";
import InfluencerTabs from "./InfluencerTabs";
import type { Influencer, InfluencerCampaign, KpiCards as KpiCardsType } from "@/lib/influencer/types";
import type { FilterState } from "./InfluencerFilters";

interface Props {
  kpi: KpiCardsType;
  influencers: Influencer[];
  activeCampaigns: InfluencerCampaign[];
  categories: string[];
}

export default function InfluencerPageClient({ kpi, influencers, activeCampaigns, categories }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
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

      {/* URL 입력 바 */}
      <TopUrlBar onFilterClick={() => setFilterOpen(true)} />

      {/* KPI 카드 */}
      <KpiCards data={kpi} />

      {/* 메인 레이아웃: 테이블(65%) + 시딩 스케줄(35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start min-h-0">
        {/* 인플루언서 테이블 (좌측) */}
        <InfluencerTable
          influencers={influencers}
          activeCampaigns={activeCampaigns}
          filters={filters}
          onSelectInfluencer={(id) => setSelectedId(id)}
          onRefresh={handleRefresh}
        />

        {/* 시딩 스케줄 (우측, 고정 너비) */}
        <SeedingTimeline campaigns={activeCampaigns} />
      </div>

      {/* 필터 모달 */}
      <InfluencerFilters
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        categories={categories}
        value={filters}
        onChange={(next) => setFilters(next)}
      />

      {/* 상세 패널 (우측 슬라이드) */}
      <InfluencerDetailPanel
        influencerId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
