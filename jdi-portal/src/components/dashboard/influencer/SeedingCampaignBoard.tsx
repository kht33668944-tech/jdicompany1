"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateCampaignStatus } from "@/lib/influencer/actions";
import StatusBadge from "./StatusBadge";
import { CAMPAIGN_STATUS_OPTIONS, CAMPAIGN_STATUS_LABEL } from "@/lib/influencer/labels";
import type { InfluencerCampaignWithInfluencer, CampaignStatus } from "@/lib/influencer/types";

interface Props {
  campaigns: InfluencerCampaignWithInfluencer[];
  selectedDate: string | null;
  onRefresh: () => void;
}

const STATUS_COUNTS: { status: CampaignStatus; color: string }[] = [
  { status: "planned", color: "text-slate-500" },
  { status: "dm_sent", color: "text-blue-500" },
  { status: "replied", color: "text-cyan-500" },
  { status: "shipped", color: "text-amber-500" },
  { status: "posted", color: "text-violet-500" },
  { status: "done", color: "text-emerald-500" },
];

function CampaignCard({ campaign, onRefresh }: { campaign: InfluencerCampaignWithInfluencer; onRefresh: () => void }) {
  const [, startTransition] = useTransition();

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as CampaignStatus;
    startTransition(async () => {
      try {
        await updateCampaignStatus(campaign.id, next);
        toast.success("상태가 변경되었습니다.");
        onRefresh();
      } catch {
        toast.error("상태 변경 실패");
      }
    });
  }

  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {campaign.influencer && (
            <div className="mb-1">
              <p className="text-xs font-medium text-slate-700 truncate">
                @{campaign.influencer.username}
              </p>
              {campaign.influencer.display_name && (
                <p className="text-[10px] text-slate-400 truncate leading-tight">
                  {campaign.influencer.display_name}
                </p>
              )}
            </div>
          )}
          <p className="text-sm font-medium text-slate-800 leading-tight truncate">
            {campaign.campaign_name}
          </p>
          {campaign.product_name && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{campaign.product_name}</p>
          )}
        </div>
        <StatusBadge status={campaign.status} type="campaign" />
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
        {campaign.ship_date && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
            발송 {campaign.ship_date}
          </span>
        )}
        {campaign.expected_post_date && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
            포스팅 {campaign.expected_post_date}
          </span>
        )}
        {campaign.cost !== null && (
          <span>{campaign.cost.toLocaleString()}원</span>
        )}
      </div>

      <select
        value={campaign.status}
        onChange={handleStatusChange}
        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-600"
        aria-label="캠페인 상태 변경"
      >
        {CAMPAIGN_STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

export default function SeedingCampaignBoard({ campaigns, selectedDate, onRefresh }: Props) {
  // 날짜 선택 시 해당 날짜에 관련 캠페인만 표시, 아니면 전체
  const displayed = selectedDate
    ? campaigns.filter((c) =>
        c.contact_date === selectedDate ||
        c.ship_date === selectedDate ||
        c.expected_post_date === selectedDate
      )
    : campaigns.filter((c) => c.status !== "done");

  // 상태별 카운트 (전체 기준)
  const active = campaigns.filter((c) => c.status !== "done");
  const countMap = new Map<CampaignStatus, number>();
  for (const c of active) {
    countMap.set(c.status, (countMap.get(c.status) ?? 0) + 1);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col gap-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">
          {selectedDate ? `${selectedDate} 캠페인` : "진행 중 캠페인"}
        </h3>
        {selectedDate && (
          <span className="text-xs text-slate-400">{displayed.length}건</span>
        )}
      </div>

      {/* 상태별 요약 (선택 날짜 없을 때만) */}
      {!selectedDate && (
        <div className="grid grid-cols-3 gap-2">
          {STATUS_COUNTS.filter(({ status }) => (countMap.get(status) ?? 0) > 0).map(({ status, color }) => (
            <div key={status} className="bg-slate-50 rounded-xl p-2.5 text-center">
              <p className={`text-lg font-bold ${color}`}>{countMap.get(status) ?? 0}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{CAMPAIGN_STATUS_LABEL[status]}</p>
            </div>
          ))}
        </div>
      )}

      {/* 캠페인 카드 목록 */}
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[480px]">
        {displayed.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">
            {selectedDate ? "이 날짜에 예정된 캠페인이 없습니다." : "진행 중인 캠페인이 없습니다."}
          </p>
        ) : (
          displayed.map((c) => (
            <CampaignCard key={c.id} campaign={c} onRefresh={onRefresh} />
          ))
        )}
      </div>
    </div>
  );
}
