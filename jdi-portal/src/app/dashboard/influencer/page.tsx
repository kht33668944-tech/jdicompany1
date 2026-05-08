import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import InfluencerPageClient from "@/components/dashboard/influencer/InfluencerPageClient";
import { getKpiCards, getInfluencers, getActiveCampaigns, getCategories } from "@/lib/influencer/queries";

export const metadata = { title: "인플루언서 관리 | JDI" };

export default async function InfluencerPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const [kpi, influencers, activeCampaigns, categories] = await Promise.all([
    getKpiCards(),
    getInfluencers({ status: "active", sortBy: "engagement_rate", sortOrder: "desc", pageSize: 50 }),
    getActiveCampaigns(),
    getCategories(),
  ]);

  return (
    <InfluencerPageClient
      kpi={kpi}
      influencers={influencers}
      activeCampaigns={activeCampaigns}
      categories={categories}
    />
  );
}
