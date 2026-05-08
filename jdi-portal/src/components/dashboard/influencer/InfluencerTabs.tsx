"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import UsersThree from "phosphor-react/dist/icons/UsersThree.esm.js";
import CalendarBlank from "phosphor-react/dist/icons/CalendarBlank.esm.js";

const tabs = [
  { href: "/dashboard/influencer", label: "리스트", icon: UsersThree, exact: true },
  { href: "/dashboard/influencer/schedule", label: "시딩 스케줄", icon: CalendarBlank, exact: false },
];

export default function InfluencerTabs() {
  const pathname = usePathname();

  return (
    <div className="glass-card rounded-2xl p-1.5 flex gap-1">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              active
                ? "bg-white text-brand-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
            }`}
          >
            <Icon size={18} weight={active ? "fill" : "regular"} />
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
