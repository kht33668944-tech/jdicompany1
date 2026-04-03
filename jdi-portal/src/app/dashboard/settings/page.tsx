import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { getCachedAllProfiles } from "@/lib/attendance/queries";
import { getNotificationSettings, getDepartments } from "@/lib/settings/queries";
import SettingsPageClient from "@/components/dashboard/settings/SettingsPageClient";
import type { Profile } from "@/lib/attendance/types";

export default async function SettingsPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const { profile, supabase } = auth;

  // 알림 설정 + admin 데이터를 병렬 fetch
  let notificationSettings = null;
  let departments: Awaited<ReturnType<typeof getDepartments>> = [];
  let allProfiles: Profile[] = [];

  if (profile.role === "admin") {
    [notificationSettings, departments, allProfiles] = await Promise.all([
      getNotificationSettings(supabase, auth.user.id),
      getDepartments(supabase),
      getCachedAllProfiles(),
    ]);
  } else {
    notificationSettings = await getNotificationSettings(supabase, auth.user.id);
  }

  return (
    <SettingsPageClient
      profile={profile}
      notificationSettings={notificationSettings}
      departments={departments}
      allProfiles={allProfiles}
      userRole={profile.role}
    />
  );
}
