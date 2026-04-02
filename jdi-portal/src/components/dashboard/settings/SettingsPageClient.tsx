"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCircle, ShieldCheck, Bell, UsersThree } from "phosphor-react";
import ProfileSection from "./ProfileSection";
import AccountSection from "./AccountSection";
import NotificationsSection from "./NotificationsSection";
import AdminSection from "./AdminSection";
import type { Profile } from "@/lib/attendance/types";
import type { SettingsTab, NotificationSettings, Department } from "@/lib/settings/types";

interface SettingsPageClientProps {
  profile: Profile;
  notificationSettings: NotificationSettings | null;
  departments: Department[];
  allProfiles: Profile[];
  userRole: string;
}

const tabs: { id: SettingsTab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: "profile", label: "프로필", icon: UserCircle },
  { id: "account", label: "계정", icon: ShieldCheck },
  { id: "notifications", label: "알림", icon: Bell },
  { id: "admin", label: "관리자", icon: UsersThree, adminOnly: true },
];

export default function SettingsPageClient({
  profile,
  notificationSettings,
  departments,
  allProfiles,
  userRole,
}: SettingsPageClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const isAdmin = userRole === "admin";

  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="bg-white rounded-2xl p-1.5 inline-flex items-center shadow-sm border border-slate-100">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                active
                  ? "bg-brand-50 text-brand-600 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon size={16} weight={active ? "fill" : "regular"} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sections */}
      {activeTab === "profile" && (
        <ProfileSection profile={profile} onUpdated={() => router.refresh()} />
      )}
      {activeTab === "account" && (
        <AccountSection profile={profile} />
      )}
      {activeTab === "notifications" && (
        <NotificationsSection userId={profile.id} initialSettings={notificationSettings} />
      )}
      {activeTab === "admin" && isAdmin && (
        <AdminSection profiles={allProfiles} departments={departments} />
      )}
    </div>
  );
}
