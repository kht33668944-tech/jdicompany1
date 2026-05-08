"use client";

import type { InfluencerCampaign } from "@/lib/influencer/types";
import CalendarBlank from "phosphor-react/dist/icons/CalendarBlank.esm.js";

interface TimelineItem {
  campaignId: string;
  date: string; // YYYY-MM-DD
  influencerUsername?: string;
  campaignName: string;
  actionLabel: string;
  statusColor: string;
}

type Props = {
  campaigns: InfluencerCampaign[];
};

function toKSTDateString(isoDate: string): string {
  // KST = UTC+9
  const d = new Date(isoDate + "T00:00:00+09:00");
  return d.toISOString().slice(0, 10);
}

function getDateLabel(dateStr: string): string {
  const today = new Date();
  const todayKST = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKST = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

  if (dateStr === todayKST) return "오늘";
  if (dateStr === tomorrowKST) return "내일";

  const [, m, d] = dateStr.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

function extractItems(campaigns: InfluencerCampaign[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  const today = new Date();
  const todayKST = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Look 30 days ahead
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 30);
  const cutoffKST = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

  for (const c of campaigns) {
    if (c.status === "done") continue;

    const entries: Array<{ date: string; action: string; color: string }> = [
      { date: c.contact_date ?? "", action: "DM 발송", color: "bg-blue-400" },
      { date: c.ship_date ?? "", action: "제품 발송", color: "bg-cyan-400" },
      {
        date: c.expected_post_date ?? "",
        action: "포스팅 확인",
        color: "bg-violet-400",
      },
    ];

    for (const entry of entries) {
      if (!entry.date) continue;
      const kstDate = toKSTDateString(entry.date);
      if (kstDate < todayKST || kstDate > cutoffKST) continue;
      items.push({
        campaignId: c.id,
        date: kstDate,
        campaignName: c.campaign_name,
        actionLabel: entry.action,
        statusColor: entry.color,
      });
    }
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}

export default function SeedingTimeline({ campaigns }: Props) {
  const items = extractItems(campaigns);

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="flex items-center gap-2 mb-4">
        <CalendarBlank size={16} className="text-slate-500" weight="bold" />
        <h3 className="text-sm font-semibold text-slate-700">시딩 스케줄</h3>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">
          예정된 시딩 일정이 없습니다
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, idx) => (
            <li key={`${item.campaignId}-${item.actionLabel}-${idx}`} className="flex items-start gap-3">
              <div className="mt-1.5 shrink-0 flex flex-col items-center">
                <span className={`w-2 h-2 rounded-full ${item.statusColor}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700 leading-tight">
                  {getDateLabel(item.date)}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {item.campaignName} — {item.actionLabel}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
