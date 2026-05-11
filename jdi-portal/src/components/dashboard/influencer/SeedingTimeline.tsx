"use client";

import type { InfluencerCampaignWithInfluencer } from "@/lib/influencer/types";
import CalendarBlank from "phosphor-react/dist/icons/CalendarBlank.esm.js";

interface TimelineItem {
  campaignId: string;
  date: string; // YYYY-MM-DD
  influencerUsername: string | null;
  influencerDisplayName: string | null;
  campaignName: string;
  actionLabel: string;
  statusColor: string;
}

type Props = {
  campaigns: InfluencerCampaignWithInfluencer[];
};

function kstDateStr(offsetDays = 0): string {
  return new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000)
    .toISOString()
    .slice(0, 10);
}

function getDateLabel(dateStr: string): string {
  if (dateStr === kstDateStr(0)) return "오늘";
  if (dateStr === kstDateStr(1)) return "내일";
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

function extractItems(campaigns: InfluencerCampaignWithInfluencer[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  const todayKST = kstDateStr(0);
  const cutoffKST = kstDateStr(7);

  for (const c of campaigns) {
    if (c.status === "done") continue;

    const entries: Array<{ date: string; action: string; color: string }> = [
      { date: c.contact_date ?? "", action: "DM 발송", color: "bg-blue-400" },
      { date: c.contract_date ?? "", action: "계약 진행", color: "bg-rose-400" },
      { date: c.ship_date ?? "", action: "제품 발송", color: "bg-cyan-400" },
      { date: c.content_deadline ?? "", action: "콘텐츠 마감", color: "bg-orange-400" },
      {
        date: c.expected_post_date ?? "",
        action: "포스팅 확인",
        color: "bg-violet-400",
      },
    ];

    for (const entry of entries) {
      if (!entry.date) continue;
      const dateStr = entry.date;
      if (dateStr < todayKST || dateStr > cutoffKST) continue;
      items.push({
        campaignId: c.id,
        date: dateStr,
        influencerUsername: c.influencer?.username ?? null,
        influencerDisplayName: c.influencer?.display_name ?? null,
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
                {item.influencerUsername && (
                  <p className="text-xs font-medium text-slate-600 truncate">
                    @{item.influencerUsername}
                    {item.influencerDisplayName && (
                      <span className="text-slate-400 font-normal ml-1">
                        {item.influencerDisplayName}
                      </span>
                    )}
                  </p>
                )}
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
