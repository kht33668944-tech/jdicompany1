"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import TopUrlBar from "./TopUrlBar";
import KpiCards from "./KpiCards";
import InfluencerTable from "./InfluencerTable";
import InfluencerFilters, { DEFAULT_FILTER_STATE } from "./InfluencerFilters";
import SeedingTimeline from "./SeedingTimeline";
import SeedingSidebarCard from "./SeedingSidebarCard";
import InfluencerDetailPanel from "./InfluencerDetailPanel";
import InfluencerTabs from "./InfluencerTabs";
import type { CampaignBasic, InfluencerListItem, InfluencerCampaignWithInfluencer, KpiCards as KpiCardsType } from "@/lib/influencer/types";
import { loadMoreInfluencers } from "@/lib/influencer/actions";
import type { FilterState } from "./InfluencerFilters";

interface Props {
  kpi: KpiCardsType;
  influencers: InfluencerListItem[];
  activeCampaigns: InfluencerCampaignWithInfluencer[];
  allCampaigns: CampaignBasic[];
  categories: string[];
}

export default function InfluencerPageClient({ kpi, influencers, activeCampaigns, allCampaigns, categories }: Props) {
  const router = useRouter();
  const [loadedInfluencers, setLoadedInfluencers] = useState(influencers);
  const [nextPage, setNextPage] = useState(2);
  const [hasMore, setHasMore] = useState(influencers.length === 25);
  const [loadingMore, startLoadMore] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [, startTransition] = useTransition();

  const handleRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  const handleLoadMore = useCallback(() => {
    startLoadMore(async () => {
      const next = await loadMoreInfluencers(nextPage);
      setLoadedInfluencers((current) => {
        const ids = new Set(current.map((influencer) => influencer.id));
        return [...current, ...next.filter((influencer) => !ids.has(influencer.id))];
      });
      setNextPage((current) => current + 1);
      setHasMore(next.length === 25);
    });
  }, [nextPage]);

  return (
    <div className="flex flex-col gap-3 sm:gap-4 px-0 py-3 sm:p-6 min-h-0">
      {/* 탭 네비게이션 */}
      <InfluencerTabs />

      {/* URL 입력 바 */}
      <TopUrlBar
        onFilterClick={() => setFilterOpen(true)}
        dateMilestone={filters.dateMilestone}
        onDateMilestoneChange={(d) => setFilters((p) => ({ ...p, dateMilestone: d }))}
      />

      {/* KPI 카드 */}
      <KpiCards data={kpi} />

      {/* 메인 레이아웃: 테이블(65%) + 시딩 스케줄(35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start min-h-0">
        {/* 인플루언서 테이블 (좌측) */}
        <InfluencerTable
          influencers={loadedInfluencers}
          activeCampaigns={activeCampaigns}
          allCampaigns={allCampaigns}
          filters={filters}
          onFiltersChange={setFilters}
          onSelectInfluencer={(id) => setSelectedId(id)}
          onRefresh={handleRefresh}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={handleLoadMore}
        />

        {/* 우측 사이드바: 시딩 스케줄 + 시딩 깔때기 */}
        <div className="flex flex-col gap-3 sm:gap-4">
          <SeedingTimeline campaigns={activeCampaigns} />
          <SeedingSidebarCard
            influencers={loadedInfluencers}
            activeCampaigns={activeCampaigns}
            filters={filters}
            onFiltersChange={setFilters}
            onInfluencerClick={(id) => setSelectedId(id)}
            onRefresh={handleRefresh}
          />
        </div>
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
