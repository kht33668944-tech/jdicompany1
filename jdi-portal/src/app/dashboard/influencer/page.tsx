import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import InfluencerPageClient from "@/components/dashboard/influencer/InfluencerPageClient";
import {
  getKpiCards,
  getInfluencers,
  getActiveCampaigns,
  getAllCampaignsBasic,
  getCategories,
} from "@/lib/influencer/queries";

export const metadata = { title: "인플루언서 관리 | JDI" };

export default async function InfluencerPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const [kpi, influencers, activeCampaigns, allCampaigns, categories] = await Promise.all([
    getKpiCards(),
    getInfluencers({ status: "active", sortBy: "engagement_rate", sortOrder: "desc", pageSize: 25 }),
    getActiveCampaigns(),
    getAllCampaignsBasic(),
    getCategories(),
  ]);

  return (
    <InfluencerPageClient
      kpi={kpi}
      influencers={influencers}
      activeCampaigns={activeCampaigns}
      allCampaigns={allCampaigns}
      categories={categories}
    />
  );
}
