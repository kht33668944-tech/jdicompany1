"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { InfluencerCampaignWithInfluencer } from "@/lib/influencer/types";
import {
  updateCampaignStatus,
  updateCampaign,
  deleteCampaign,
} from "@/lib/influencer/actions";
import { kstTodayStr } from "@/lib/influencer/calendar";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  campaigns: InfluencerCampaignWithInfluencer[];
  onInfluencerClick?: (influencerId: string) => void;
  onRefresh: () => void;
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(fromStr + "T00:00:00Z");
  const to = new Date(toStr + "T00:00:00Z");
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function cleanDisplayName(raw: string | null, username: string): string {
  if (!raw) return `@${username}`;
  const pipeIdx = raw.indexOf("|");
  const name = pipeIdx !== -1 ? raw.slice(0, pipeIdx).trim() : raw.trim();
  return name || `@${username}`;
}

interface UrgencyStyle {
  textClass: string;
  dotClass: string;
  label: string;
}

function getUrgencyStyle(daysSince: number): UrgencyStyle {
  if (daysSince <= 2)
    return { textClass: "text-slate-500", dotClass: "bg-slate-400", label: "" };
  if (daysSince <= 4)
    return { textClass: "text-amber-600", dotClass: "bg-amber-500", label: "" };
  if (daysSince <= 6)
    return { textClass: "text-orange-600", dotClass: "bg-orange-500", label: "🟠" };
  return { textClass: "text-rose-600", dotClass: "bg-rose-500", label: "🔴" };
}

// ─── 행 컴포넌트 ──────────────────────────────────────────────────────────────

interface RowProps {
  campaign: InfluencerCampaignWithInfluencer;
  daysSince: number;
  onInfluencerClick?: (influencerId: string) => void;
  onRefresh: () => void;
}

function StaleDmRow({ campaign, daysSince, onInfluencerClick, onRefresh }: RowProps) {
  const [isPending, startTransition] = useTransition();
  const { textClass, dotClass, label } = getUrgencyStyle(daysSince);

  const inf = campaign.influencer;
  const username = inf?.username ?? "";
  const displayName = cleanDisplayName(inf?.display_name ?? null, username);

  function handleInfluencerClick() {
    onInfluencerClick?.(campaign.influencer_id);
  }

  function handleReplied() {
    startTransition(async () => {
      try {
        await updateCampaignStatus(campaign.id, "replied");
        toast.success("응답 받음으로 변경했습니다.");
        onRefresh();
      } catch {
        toast.error("상태 변경에 실패했습니다.");
      }
    });
  }

  function handleReDm() {
    startTransition(async () => {
      try {
        await updateCampaign(campaign.id, { contact_date: kstTodayStr() });
        toast.success("재DM 처리되었습니다. (경과일 리셋)");
        onRefresh();
      } catch {
        toast.error("재DM 처리에 실패했습니다.");
      }
    });
  }

  function handleGiveUp() {
    if (!confirm("이 캠페인을 포기하고 삭제하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await deleteCampaign(campaign.id);
        toast.success("캠페인이 삭제되었습니다.");
        onRefresh();
      } catch {
        toast.error("캠페인 삭제에 실패했습니다.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5 p-2 rounded-lg hover:bg-slate-50 transition-colors">
      {/* 1행: 인플루언서 이름 + 경과일 */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={handleInfluencerClick}
      >
        <span className="text-sm font-medium text-slate-800 truncate">
          @{username}
          {inf?.display_name ? (
            <span className="text-slate-500 font-normal"> · {displayName}</span>
          ) : null}
        </span>
        <span className={`flex items-center gap-1 text-xs font-semibold shrink-0 ml-2 ${textClass}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
          {label && <span>{label}</span>}
          {daysSince}일 전
        </span>
      </div>

      {/* 2행: 액션 버튼 */}
      <div
        className="flex items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleReplied}
          disabled={isPending}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          ✓ 응답
        </button>
        <button
          onClick={handleReDm}
          disabled={isPending}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
        >
          ↻ 재DM
        </button>
        <button
          onClick={handleGiveUp}
          disabled={isPending}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
        >
          ✕ 포기
        </button>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function StaleDmList({ campaigns, onInfluencerClick, onRefresh }: Props) {
  const today = kstTodayStr();

  const stale = campaigns
    .filter((c) => c.status === "dm_sent" && c.contact_date !== null)
    .map((c) => ({ campaign: c, daysSince: daysBetween(c.contact_date!, today) }))
    .sort((a, b) => b.daysSince - a.daysSince);

  if (stale.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="text-3xl mb-2">🎉</div>
        <p className="text-sm font-medium text-slate-700">응답 없는 DM이 없습니다</p>
        <p className="text-xs text-slate-400 mt-1">모든 DM에 답을 받으셨네요!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {stale.map(({ campaign, daysSince }) => (
        <StaleDmRow
          key={campaign.id}
          campaign={campaign}
          daysSince={daysSince}
          onInfluencerClick={onInfluencerClick}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}
