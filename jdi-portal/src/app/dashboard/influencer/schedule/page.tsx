import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import SeedingSchedulePage from "@/components/dashboard/influencer/SeedingSchedulePage";
import { getActiveCampaigns } from "@/lib/influencer/queries";
import { getContractSummariesForList } from "@/lib/influencer/contracts/queries";

export const metadata = { title: "시딩 스케줄 | JDI" };

export default async function InfluencerSchedulePage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  // 계약 요약을 함께 받는다. 예전에는 캠페인만 불러와서 이 화면만 계약을 몰랐고,
  // 그래서 상태가 옛 6단계로 보이고 계약서로 가는 길도 없었다(리스트 page.tsx 와 같은 방식).
  const [activeCampaigns, contractSummaries] = await Promise.all([
    getActiveCampaigns(),
    getContractSummariesForList(),
  ]);

  return (
    <SeedingSchedulePage
      activeCampaigns={activeCampaigns}
      contractSummaries={contractSummaries}
    />
  );
}
