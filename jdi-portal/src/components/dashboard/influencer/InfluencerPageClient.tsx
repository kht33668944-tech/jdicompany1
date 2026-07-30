"use client";

import { useState, useCallback, useEffect, useMemo, useTransition } from "react";
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
import { loadMoreInfluencers, searchInfluencers } from "@/lib/influencer/actions";
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
  // 1페이지(서버 prop)는 상태로 복사하지 않는다. 복사하면 분석 완료 후 router.refresh()로
  // 새 목록이 내려와도 화면이 첫 진입 때 값에 묶여 새 인플루언서가 안 보인다.
  // "더 불러오기"로 받은 2페이지 이후만 별도로 쌓아 둔다.
  const [extraPages, setExtraPages] = useState<InfluencerListItem[]>([]);
  const [searchExtras, setSearchExtras] = useState<InfluencerListItem[]>([]);
  const [nextPage, setNextPage] = useState(2);
  const [lastPageFull, setLastPageFull] = useState(true);
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
      setExtraPages((current) => {
        const ids = new Set(current.map((influencer) => influencer.id));
        return [...current, ...next.filter((influencer) => !ids.has(influencer.id))];
      });
      setNextPage((current) => current + 1);
      setLastPageFull(next.length === 25);
    });
  }, [nextPage]);

  // 검색어는 서버에서 전체 인플루언서를 대상으로 찾는다.
  // (화면에 불러온 25명 안에서만 걸러내면 나머지는 검색해도 안 나옴)
  const searchTerm = filters.search.trim();
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (searchTerm.length < 2) {
        setSearchExtras((current) => (current.length === 0 ? current : []));
        return;
      }
      try {
        const rows = await searchInfluencers(searchTerm);
        if (!cancelled) setSearchExtras(rows);
      } catch {
        // 서버 검색 실패 시에는 이미 불러온 목록 안에서만 걸러진다.
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  // 화면에 쓸 목록 = 서버 1페이지 + 더 불러온 페이지 + 검색으로 찾아온 사람 (id 중복 제거)
  const loadedInfluencers = useMemo(() => {
    const merged: InfluencerListItem[] = [];
    const ids = new Set<string>();
    for (const influencer of [...influencers, ...extraPages, ...searchExtras]) {
      if (ids.has(influencer.id)) continue;
      ids.add(influencer.id);
      merged.push(influencer);
    }
    return merged;
  }, [influencers, extraPages, searchExtras]);

  const hasMore = influencers.length === 25 && lastPageFull;

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
