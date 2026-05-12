"use client";

import { useTransition, useState } from "react";
import { toast } from "sonner";
import { updateCampaignStatus } from "@/lib/influencer/actions";
import CampaignStatusDropdown from "./CampaignStatusDropdown";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/influencer/labels";
import type { InfluencerCampaignWithInfluencer, CampaignStatus } from "@/lib/influencer/types";
import {
  kstTodayStr,
  addDaysStr,
  getCampaignDatesInRange,
  getTodayCampaignTasks,
  getMilestoneStyle,
  type MilestoneKind,
} from "@/lib/influencer/calendar";

const STATUS_BORDER: Record<CampaignStatus, string> = {
  planned: "border-l-slate-300",
  dm_sent: "border-l-blue-400",
  replied: "border-l-cyan-400",
  shipped: "border-l-amber-400",
  posted: "border-l-violet-400",
  done: "border-l-emerald-400",
};

function pickNextMilestone(
  campaign: InfluencerCampaignWithInfluencer,
): { kind: MilestoneKind; date: string } | null {
  const today = kstTodayStr();
  const candidates: { kind: MilestoneKind; date: string }[] = [];
  if (campaign.contact_date) candidates.push({ kind: "dm", date: campaign.contact_date });
  if (campaign.contract_date) candidates.push({ kind: "contract", date: campaign.contract_date });
  if (campaign.ship_date) candidates.push({ kind: "ship", date: campaign.ship_date });
  if (campaign.content_deadline) candidates.push({ kind: "deadline", date: campaign.content_deadline });
  if (campaign.expected_post_date) candidates.push({ kind: "post", date: campaign.expected_post_date });
  if (candidates.length === 0) return null;
  const future = candidates
    .filter((c) => c.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (future.length > 0) return future[0];
  return candidates.sort((a, b) => b.date.localeCompare(a.date))[0];
}

function shortMD(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function formatCostShort(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만원`;
  return `${n.toLocaleString()}원`;
}

function cleanDisplayName(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  const beforePipe = displayName.split("|")[0].trim();
  return beforePipe || displayName;
}

interface Props {
  campaigns: InfluencerCampaignWithInfluencer[];
  selectedDate: string | null;
  onRefresh: () => void;
  onInfluencerClick?: (influencerId: string) => void;
}

const STATUS_COUNTS: { status: CampaignStatus; color: string }[] = [
  { status: "planned", color: "text-slate-500" },
  { status: "dm_sent", color: "text-blue-500" },
  { status: "replied", color: "text-cyan-500" },
  { status: "shipped", color: "text-amber-500" },
  { status: "posted", color: "text-violet-500" },
  { status: "done", color: "text-emerald-500" },
];

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}(${DAY_KO[d.getDay()]})`;
}

function CampaignCard({
  campaign,
  onRefresh,
  onInfluencerClick,
}: {
  campaign: InfluencerCampaignWithInfluencer;
  onRefresh: () => void;
  onInfluencerClick?: (influencerId: string) => void;
}) {
  const [, startTransition] = useTransition();

  function handleStatusChange(next: CampaignStatus) {
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

  function handleHeaderClick() {
    if (onInfluencerClick) onInfluencerClick(campaign.influencer_id);
  }

  const username = campaign.influencer?.username ?? null;
  const displayName = cleanDisplayName(campaign.influencer?.display_name);
  const hasDisplayName = displayName !== null && displayName !== `@${username}`;
  const isAutoName = username !== null && campaign.campaign_name === `@${username} 시딩`;

  const milestone = pickNextMilestone(campaign);
  const metaParts: React.ReactNode[] = [];
  if (!isAutoName && campaign.campaign_name) {
    metaParts.push(
      <span key="name" className="text-slate-600 font-medium">{campaign.campaign_name}</span>,
    );
  }
  if (campaign.product_name) {
    metaParts.push(<span key="product">{campaign.product_name}</span>);
  }
  if (milestone) {
    const style = getMilestoneStyle(milestone.kind);
    metaParts.push(
      <span key="ms" className="tabular-nums">
        {style.icon} {shortMD(milestone.date)}
      </span>,
    );
  }
  if (campaign.cost !== null) {
    metaParts.push(<span key="cost" className="tabular-nums">{formatCostShort(campaign.cost)}</span>);
  }

  return (
    <div
      className={`bg-slate-50 rounded-lg pl-3 pr-2.5 py-2 border border-slate-100 border-l-4 ${STATUS_BORDER[campaign.status]} hover:bg-slate-100/70 transition-colors`}
    >
      {/* 1행: 인플 + 상태 dropdown */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleHeaderClick}
          disabled={!onInfluencerClick}
          className="min-w-0 flex-1 text-left flex items-baseline gap-1.5 group disabled:cursor-default"
        >
          {username ? (
            <>
              <span className="text-sm font-semibold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                @{username}
              </span>
              {hasDisplayName && (
                <span className="text-xs text-slate-500 truncate">· {displayName}</span>
              )}
            </>
          ) : (
            <span className="text-sm font-medium text-slate-700 truncate">{campaign.campaign_name}</span>
          )}
        </button>
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <CampaignStatusDropdown status={campaign.status} onChange={handleStatusChange} />
        </div>
      </div>

      {/* 2행: 메타 (캠페인명·제품·일정·비용) */}
      <div className="mt-0.5 text-[11px] text-slate-500 truncate">
        {metaParts.length === 0 ? (
          <span className="text-slate-400 italic">일정/제품 미입력</span>
        ) : (
          metaParts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span className="text-slate-300 mx-1.5">·</span>}
              {part}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

type TodayFilter = "dm" | "contract" | "ship" | "deadline" | "post" | null;

function TodayTasksSection({
  campaigns,
  onInfluencerClick,
}: {
  campaigns: InfluencerCampaignWithInfluencer[];
  onInfluencerClick?: (influencerId: string) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<TodayFilter>(null);
  const { dmList, contractList, shipList, deadlineList, postList } = getTodayCampaignTasks(campaigns);
  const isEmpty =
    dmList.length === 0 &&
    contractList.length === 0 &&
    shipList.length === 0 &&
    deadlineList.length === 0 &&
    postList.length === 0;

  if (isEmpty) {
    return (
      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
        <p className="text-xs font-semibold text-slate-700 mb-2">🔔 오늘 할 일</p>
        <p className="text-xs text-slate-400 text-center py-1">오늘 할 일 없음 ✨</p>
      </div>
    );
  }

  const categories: { key: NonNullable<TodayFilter>; icon: string; label: string; count: number }[] = [
    { key: "dm", icon: "📩", label: "DM 보낼 곳", count: dmList.length },
    { key: "contract", icon: "✍️", label: "계약 진행", count: contractList.length },
    { key: "ship", icon: "📦", label: "발송할 제품", count: shipList.length },
    { key: "deadline", icon: "⏰", label: "콘텐츠 마감", count: deadlineList.length },
    { key: "post", icon: "🔍", label: "포스팅 확인", count: postList.length },
  ];

  const filteredList =
    activeFilter === "dm" ? dmList :
    activeFilter === "contract" ? contractList :
    activeFilter === "ship" ? shipList :
    activeFilter === "deadline" ? deadlineList :
    activeFilter === "post" ? postList :
    [];

  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
      <p className="text-xs font-semibold text-slate-700">🔔 오늘 할 일</p>
      <div className="grid grid-cols-5 gap-1.5">
        {categories.map(({ key, icon, label, count }) => (
          <button
            key={key}
            onClick={() => setActiveFilter(activeFilter === key ? null : key)}
            className={`rounded-lg p-2 text-center transition-colors ${
              count === 0
                ? "bg-white border border-slate-100 opacity-50 cursor-default"
                : activeFilter === key
                ? "bg-blue-50 border border-blue-200"
                : "bg-white border border-slate-200 hover:border-slate-300"
            }`}
          >
            <p className="text-base leading-none mb-1">{icon}</p>
            <p className={`text-sm font-bold ${count === 0 ? "text-slate-300" : "text-slate-700"}`}>{count}</p>
            <p className={`text-[9px] leading-tight mt-0.5 ${count === 0 ? "text-slate-300" : "text-slate-500"}`}>{label}</p>
          </button>
        ))}
      </div>
      {activeFilter && filteredList.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          {filteredList.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => onInfluencerClick?.(c.influencer_id)}
              disabled={!onInfluencerClick}
              className="bg-white rounded-lg px-2.5 py-1.5 border border-slate-100 flex items-center gap-2 text-left hover:border-blue-300 hover:bg-blue-50/40 transition-colors disabled:cursor-default disabled:hover:bg-white disabled:hover:border-slate-100"
            >
              <span className="text-xs text-slate-500 font-medium truncate">
                {c.influencer ? `@${c.influencer.username}` : c.campaign_name}
              </span>
              <span className="text-[10px] text-slate-400 truncate flex-1">{c.campaign_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UpcomingSection({
  campaigns,
  onInfluencerClick,
}: {
  campaigns: InfluencerCampaignWithInfluencer[];
  onInfluencerClick?: (influencerId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const today = kstTodayStr();
  const from = addDaysStr(today, 1);
  const to = addDaysStr(today, 7);
  const inRange = getCampaignDatesInRange(campaigns, from, to);

  type UpcomingItem = {
    campaignId: string;
    influencerId: string;
    dateStr: string;
    label: string;
    username: string;
  };
  const items: UpcomingItem[] = [];

  for (const c of inRange) {
    const candidates: { dateStr: string; label: string }[] = [];
    if (c.contact_date && c.contact_date >= from && c.contact_date <= to) {
      candidates.push({ dateStr: c.contact_date, label: "DM 보내기" });
    }
    if (c.contract_date && c.contract_date >= from && c.contract_date <= to) {
      candidates.push({ dateStr: c.contract_date, label: "계약 진행" });
    }
    if (c.ship_date && c.ship_date >= from && c.ship_date <= to) {
      candidates.push({ dateStr: c.ship_date, label: "발송 마감" });
    }
    if (c.content_deadline && c.content_deadline >= from && c.content_deadline <= to) {
      candidates.push({ dateStr: c.content_deadline, label: "콘텐츠 마감" });
    }
    if (c.expected_post_date && c.expected_post_date >= from && c.expected_post_date <= to) {
      candidates.push({ dateStr: c.expected_post_date, label: "포스팅 예정" });
    }
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    const best = candidates[0];
    items.push({
      campaignId: c.id,
      influencerId: c.influencer_id,
      dateStr: best.dateStr,
      label: best.label,
      username: c.influencer ? `@${c.influencer.username}` : c.campaign_name,
    });
  }

  items.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  const LIMIT = 5;
  const visible = expanded ? items : items.slice(0, LIMIT);
  const hiddenCount = items.length - LIMIT;

  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
      <p className="text-xs font-semibold text-slate-700">📅 다가오는 7일</p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-1">다가오는 7일 일정 없음</p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {visible.map((item) => (
              <button
                type="button"
                key={`${item.campaignId}-${item.dateStr}-${item.label}`}
                onClick={() => onInfluencerClick?.(item.influencerId)}
                disabled={!onInfluencerClick}
                className="flex items-center gap-2 text-xs text-slate-600 text-left rounded-md px-1 py-0.5 -mx-1 hover:bg-blue-50/40 hover:text-blue-700 transition-colors disabled:hover:bg-transparent disabled:hover:text-slate-600 disabled:cursor-default"
              >
                <span className="text-slate-400 shrink-0">{formatDateLabel(item.dateStr)}</span>
                <span className="font-medium truncate">{item.username}</span>
                <span className="text-slate-400 shrink-0">{item.label}</span>
              </button>
            ))}
          </div>
          {!expanded && hiddenCount > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="text-[11px] text-blue-500 hover:text-blue-600 w-full text-center pt-0.5"
            >
              +{hiddenCount}건 더
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function SeedingCampaignBoard({ campaigns, selectedDate, onRefresh, onInfluencerClick }: Props) {
  const displayed = selectedDate
    ? campaigns.filter((c) =>
        c.contact_date === selectedDate ||
        c.contract_date === selectedDate ||
        c.ship_date === selectedDate ||
        c.content_deadline === selectedDate ||
        c.expected_post_date === selectedDate
      )
    : campaigns.filter((c) => c.status !== "done");

  const active = campaigns.filter((c) => c.status !== "done");
  const countMap = new Map<CampaignStatus, number>();
  for (const c of active) {
    countMap.set(c.status, (countMap.get(c.status) ?? 0) + 1);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 sm:p-5 flex flex-col gap-3 sm:gap-4">
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

      {/* 오늘 할 일 + 다가오는 7일 (선택 날짜 없을 때만) */}
      {!selectedDate && (
        <>
          <TodayTasksSection campaigns={campaigns} onInfluencerClick={onInfluencerClick} />
          <UpcomingSection campaigns={campaigns} onInfluencerClick={onInfluencerClick} />
        </>
      )}

      {/* 캠페인 카드 목록 */}
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[480px]">
        {displayed.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">
            {selectedDate ? "이 날짜에 예정된 캠페인이 없습니다." : "진행 중인 캠페인이 없습니다."}
          </p>
        ) : (
          displayed.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onRefresh={onRefresh}
              onInfluencerClick={onInfluencerClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
