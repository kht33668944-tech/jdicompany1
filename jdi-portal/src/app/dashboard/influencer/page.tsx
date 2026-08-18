import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import InfluencerPageClient from "@/components/dashboard/influencer/InfluencerPageClient";
import {
  getKpiCards,
  getInfluencers,
  getAllCampaigns,
  getCategories,
} from "@/lib/influencer/queries";
import { getContractSummariesForList } from "@/lib/influencer/contracts/queries";
import { UUID_RE } from "@/lib/influencer/contracts/constants";

export const metadata = { title: "인플루언서 관리 | JDI" };

export default async function InfluencerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  // 계약 탭의 「👥 리스트에서 보기」 → 이 사람 상세를 바로 연다
  const params = await searchParams;
  const openParam = typeof params.openInfluencerId === "string" ? params.openInfluencerId : "";
  const openInfluencerId = openParam && UUID_RE.test(openParam) ? openParam : null;

  const [kpi, influencers, allCampaigns, categories, contractSummaries] = await Promise.all([
    getKpiCards(),
    getInfluencers({ status: "active", sortBy: "engagement_rate", sortOrder: "desc", pageSize: 25 }),
    getAllCampaigns(),
    getCategories(),
    getContractSummariesForList(),
  ]);

  // 취소된 계약의 캠페인은 이력으로 남겨 두되(예전엔 지웠다) 진행 중 집계에서는 뺀다.
  const canceledCampaignIds = new Set(
    contractSummaries
      .filter((s) => s.contract_status === "canceled" && s.campaign_id)
      .map((s) => s.campaign_id as string),
  );
  const liveCampaigns = allCampaigns.filter((c) => !canceledCampaignIds.has(c.id));
  const activeCampaigns = liveCampaigns.filter((c) => c.status !== "done");

  // 진행/완료/금액은 이미 전량 불러온 캠페인에서 직접 센다 — 취소분을 빼야 하고,
  // KPI 카드와 우측 깔때기가 서로 다른 숫자를 보여주던 문제도 함께 사라진다.
  const kpiCards = {
    ...kpi,
    activeCampaigns: { value: activeCampaigns.length },
    doneCampaigns: { value: liveCampaigns.filter((c) => c.status === "done").length },
    totalSeedingCost: { value: liveCampaigns.reduce((sum, c) => sum + (c.cost ?? 0), 0) },
  };

  return (
    <InfluencerPageClient
      kpi={kpiCards}
      influencers={influencers}
      activeCampaigns={activeCampaigns}
      allCampaigns={liveCampaigns}
      categories={categories}
      contractSummaries={contractSummaries}
      totalInfluencerCount={kpi.totalInfluencers.value}
      initialSelectedInfluencerId={openInfluencerId}
    />
  );
}
