"use client";

import { useState, useCallback, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import TopUrlBar from "./TopUrlBar";
import KpiCards from "./KpiCards";
import InfluencerTable from "./InfluencerTable";
import InfluencerFilters, { DEFAULT_FILTER_STATE } from "./InfluencerFilters";
import SeedingTimeline from "./SeedingTimeline";
import SeedingSidebarCard from "./SeedingSidebarCard";
import InfluencerDetailPanel from "./InfluencerDetailPanel";
import InfluencerTabs from "./InfluencerTabs";
import type { CampaignBasic, InfluencerListItem, InfluencerCampaignWithInfluencer, KpiCards as KpiCardsType } from "@/lib/influencer/types";
import type { ContractListSummary, InfluencerContract } from "@/lib/influencer/contracts/types";
import { loadAllInfluencers, loadMoreInfluencers, searchInfluencers } from "@/lib/influencer/actions";
import { startSeeding } from "@/lib/influencer/contracts/actions";
import { getErrorMessage } from "@/lib/utils/errors";
import type { FilterState } from "./InfluencerFilters";

// 계약 폼은 「시딩 시작」을 눌렀을 때만 필요하다 — 초기 JS 예산을 지키려고 지연 로드
// (계약 탭이 쓰는 방식과 같다).
const ContractFormModal = dynamic(() => import("./contracts/ContractFormModal"), { ssr: false });

interface Props {
  kpi: KpiCardsType;
  influencers: InfluencerListItem[];
  activeCampaigns: InfluencerCampaignWithInfluencer[];
  allCampaigns: CampaignBasic[];
  categories: string[];
  /** 리스트에서도 계약 상태를 그대로 보여주기 위한 요약 (influencer_id 기준) */
  contractSummaries: ContractListSummary[];
  /** 전체 활성 인플루언서 수 — 화면에 불러온 25명과 구분해서 표시한다 */
  totalInfluencerCount: number;
  /** 계약 탭에서 「리스트에서 보기」로 들어왔을 때 바로 열 상세 */
  initialSelectedInfluencerId: string | null;
}

export default function InfluencerPageClient({
  kpi,
  influencers,
  activeCampaigns,
  allCampaigns,
  categories,
  contractSummaries,
  totalInfluencerCount,
  initialSelectedInfluencerId,
}: Props) {
  const router = useRouter();
  // 1페이지(서버 prop)는 상태로 복사하지 않는다. 복사하면 분석 완료 후 router.refresh()로
  // 새 목록이 내려와도 화면이 첫 진입 때 값에 묶여 새 인플루언서가 안 보인다.
  // "더 불러오기"로 받은 2페이지 이후만 별도로 쌓아 둔다.
  const [extraPages, setExtraPages] = useState<InfluencerListItem[]>([]);
  const [searchExtras, setSearchExtras] = useState<InfluencerListItem[]>([]);
  const [nextPage, setNextPage] = useState(2);
  const [lastPageFull, setLastPageFull] = useState(true);
  const [fullListLoaded, setFullListLoaded] = useState(false);
  const [loadingMore, startLoadMore] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedInfluencerId);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [, startTransition] = useTransition();

  // 「시딩 시작」으로 만들어진(또는 이미 있던) 계약 — 값을 채우도록 폼을 바로 띄운다
  const [seedingContract, setSeedingContract] = useState<InfluencerContract | null>(null);
  const [seedingBusy, startSeedingTransition] = useTransition();

  const handleRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  /**
   * 시딩 시작 = 계약 시작. 시딩건과 계약을 함께 만들고 곧바로 계약 폼을 열어
   * 제품·금액·날짜를 받는다. 탭을 옮기지 않아 흐름이 끊기지 않는다.
   * 이미 계약이 있는 사람이면 새로 만들지 않고 그 계약을 연다.
   */
  const handleStartSeeding = useCallback((influencerId: string) => {
    startSeedingTransition(async () => {
      try {
        const { contract, created } = await startSeeding(influencerId);
        setSeedingContract(contract);
        if (!created) toast.info("이미 진행 중인 TMA 계약이 있어 그 계약을 엽니다.");
      } catch (err) {
        toast.error(getErrorMessage(err, "시딩 시작 실패"));
      }
    });
  }, []);

  // 상세를 연 뒤 주소창의 파라미터는 지운다(새로고침 때 다시 열리지 않도록)
  useEffect(() => {
    if (initialSelectedInfluencerId) router.replace("/dashboard/influencer");
  }, [initialSelectedInfluencerId, router]);

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

  // 필터를 켜면 전체를 받아 온다.
  // 25명씩 끊어 불러온 상태에서 걸러 내면 아직 안 불러온 사람이 통째로 빠져서,
  // "상태: 발송완료" 같은 필터가 실제보다 적게 나온다.
  const needsFullList =
    filters.grades.length > 0 ||
    filters.categories.length > 0 ||
    filters.tags.length > 0 ||
    filters.followerTiers.length > 0 ||
    filters.contractStatuses.length > 0 ||
    filters.noCampaign ||
    filters.dateMilestone !== null;
  useEffect(() => {
    if (!needsFullList || fullListLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadAllInfluencers();
        if (cancelled) return;
        setExtraPages(rows);
        setFullListLoaded(true);
      } catch {
        // 실패하면 이미 불러온 목록 안에서만 걸러진다(예전 동작).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsFullList, fullListLoaded]);

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

  const hasMore = influencers.length === 25 && lastPageFull && !fullListLoaded;

  // influencer_id → 계약 요약. 리스트 상태 배지·계약 표시가 함께 쓴다.
  const contractByInfluencer = useMemo(() => {
    const map = new Map<string, ContractListSummary>();
    for (const summary of contractSummaries) map.set(summary.influencer_id, summary);
    return map;
  }, [contractSummaries]);

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
          contractByInfluencer={contractByInfluencer}
          filters={filters}
          onFiltersChange={setFilters}
          onSelectInfluencer={(id) => setSelectedId(id)}
          onRefresh={handleRefresh}
          onStartSeeding={handleStartSeeding}
          seedingBusy={seedingBusy}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={handleLoadMore}
        />

        {/* 우측 사이드바: 시딩 스케줄 + 시딩 깔때기 */}
        <div className="flex flex-col gap-3 sm:gap-4">
          <SeedingTimeline campaigns={activeCampaigns} />
          <SeedingSidebarCard
            activeCampaigns={activeCampaigns}
            allCampaigns={allCampaigns}
            contractByInfluencer={contractByInfluencer}
            totalInfluencerCount={totalInfluencerCount}
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
        contract={selectedId ? contractByInfluencer.get(selectedId) : undefined}
        onClose={() => setSelectedId(null)}
      />

      {/* 시딩 시작 직후 여는 계약 폼 — 제품·금액·날짜를 여기서 채운다 */}
      {seedingContract && (
        <ContractFormModal
          contract={seedingContract}
          onClose={() => setSeedingContract(null)}
          onSaved={() => {
            setSeedingContract(null);
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}
