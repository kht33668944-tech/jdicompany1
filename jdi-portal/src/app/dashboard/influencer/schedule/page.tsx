import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import SeedingSchedulePage from "@/components/dashboard/influencer/SeedingSchedulePage";
import { getActiveCampaigns } from "@/lib/influencer/queries";

export const metadata = { title: "시딩 스케줄 | JDI" };

export default async function InfluencerSchedulePage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const activeCampaigns = await getActiveCampaigns();

  return <SeedingSchedulePage activeCampaigns={activeCampaigns} />;
}
