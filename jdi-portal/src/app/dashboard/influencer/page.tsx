import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import InfluencerPageClient from "@/components/dashboard/influencer/InfluencerPageClient";
import {
  getKpiCards,
  getInfluencers,
  getAllCampaigns,
  getCategories,
} from "@/lib/influencer/queries";

export const metadata = { title: "인플루언서 관리 | JDI" };

export default async function InfluencerPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const [kpi, influencers, allCampaigns, categories] = await Promise.all([
    getKpiCards(),
    getInfluencers({ status: "active", sortBy: "engagement_rate", sortOrder: "desc", pageSize: 25 }),
    getAllCampaigns(),
    getCategories(),
  ]);
  const activeCampaigns = allCampaigns.filter((c) => c.status !== "done");

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
