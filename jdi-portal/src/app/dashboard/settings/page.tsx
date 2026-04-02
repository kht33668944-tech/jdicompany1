import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getAllProfiles } from "@/lib/attendance/queries";
import { getNotificationSettings, getDepartments } from "@/lib/settings/queries";
import SettingsPageClient from "@/components/dashboard/settings/SettingsPageClient";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await getProfile(supabase, user.id);
  if (!profile) redirect("/login");

  const notificationSettings = await getNotificationSettings(supabase, user.id);

  let departments: Awaited<ReturnType<typeof getDepartments>> = [];
  let allProfiles: Awaited<ReturnType<typeof getAllProfiles>> = [];

  if (profile.role === "admin") {
    [departments, allProfiles] = await Promise.all([
      getDepartments(supabase),
      getAllProfiles(supabase),
    ]);
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
