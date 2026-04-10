import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { getCachedAllProfiles } from "@/lib/attendance/queries.server";
import { getNotificationSettings, getDepartments } from "@/lib/settings/queries";
import { getMyHireDateChangeRequests, getMyIpChangeRequests } from "@/lib/attendance/queries";
import SettingsPageClient from "@/components/dashboard/settings/SettingsPageClient";
import type { Profile, HireDateChangeRequest, IpChangeRequest } from "@/lib/attendance/types";

export default async function SettingsPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const { profile, supabase } = auth;

  // 알림 설정 + admin 데이터를 병렬 fetch
  let notificationSettings = null;
  let departments: Awaited<ReturnType<typeof getDepartments>> = [];
  let allProfiles: Profile[] = [];
  let myHireDateChangeRequests: HireDateChangeRequest[] = [];
  let myIpChangeRequests: IpChangeRequest[] = [];

  if (profile.role === "admin") {
    [notificationSettings, departments, allProfiles, myHireDateChangeRequests, myIpChangeRequests] = await Promise.all([
      getNotificationSettings(supabase, auth.user.id),
      getDepartments(supabase),
      getCachedAllProfiles(),
      getMyHireDateChangeRequests(supabase, auth.user.id),
      getMyIpChangeRequests(supabase, auth.user.id),
    ]);
  } else {
    [notificationSettings, myHireDateChangeRequests, myIpChangeRequests] = await Promise.all([
      getNotificationSettings(supabase, auth.user.id),
      getMyHireDateChangeRequests(supabase, auth.user.id),
      getMyIpChangeRequests(supabase, auth.user.id),
    ]);
  }

  return (
    <SettingsPageClient
      profile={profile}
      notificationSettings={notificationSettings}
      departments={departments}
      allProfiles={allProfiles}
      userRole={profile.role}
      myHireDateChangeRequests={myHireDateChangeRequests}
      myIpChangeRequests={myIpChangeRequests}
    />
  );
}
