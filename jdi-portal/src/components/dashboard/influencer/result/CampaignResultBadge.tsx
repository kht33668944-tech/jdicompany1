"use client";

import { useState } from "react";
import { toast } from "sonner";
import ArrowsClockwise from "phosphor-react/dist/icons/ArrowsClockwise.esm.js";
import { formatCount } from "@/lib/influencer/format";
import { toDateStringFromTimestamp } from "@/lib/utils/date";
import { refreshCampaignResult } from "@/lib/influencer/result-actions";
import type { InfluencerCampaign } from "@/lib/influencer/types";

interface Props {
  campaign: InfluencerCampaign;
  onChanged: () => void;
}

export default function CampaignResultBadge({ campaign, onChanged }: Props) {
  const [loading, setLoading] = useState(false);

  const hasResult =
    campaign.result_views !== null ||
    campaign.result_likes !== null ||
    campaign.result_comments !== null;

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const result = await refreshCampaignResult(campaign.id);
      if (result) {
        toast.success("성과를 갱신했습니다.");
        onChanged();
      } else {
        toast.error(
          "최근 게시물 목록에 없어 갱신하지 못했습니다. 먼저 인플루언서를 재동기화해 보세요."
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "성과 갱신 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {hasResult ? (
        <div className="flex items-center gap-2 text-[11px] tabular-nums">
          <span className="text-violet-600 font-semibold">
            조회 {formatCount(campaign.result_views)}
          </span>
          <span className="text-slate-500">♥ {formatCount(campaign.result_likes)}</span>
          <span className="text-slate-500">💬 {formatCount(campaign.result_comments)}</span>
          {campaign.result_captured_at && (
            <span className="text-slate-300">
              {toDateStringFromTimestamp(campaign.result_captured_at).slice(5)} 기준
            </span>
          )}
        </div>
      ) : (
        <span className="text-[11px] text-slate-400">
          {campaign.post_url ? "성과 미수집" : "게시물 미연결"}
        </span>
      )}

      {campaign.post_url && (
        <button
          onClick={() => void handleRefresh()}
          disabled={loading}
          className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-medium transition-colors disabled:opacity-50"
        >
          <ArrowsClockwise size={11} weight="bold" className={loading ? "animate-spin" : ""} />
          {loading ? "갱신 중…" : "성과 새로고침"}
        </button>
      )}
    </div>
  );
}
