"use client";

import { useMemo } from "react";
import { formatCount, formatKRW } from "@/lib/influencer/format";
import type { InfluencerCampaign } from "@/lib/influencer/types";

interface Props {
  campaigns: InfluencerCampaign[];
}

/**
 * 인플루언서별 자사 실적.
 * 팔로워 기반 등급과 별개로 "우리랑 해서 실제로 얼마나 나왔나"를 보여준다.
 * 이미 받아온 캠페인 목록으로 계산해 추가 왕복을 만들지 않는다.
 */
export default function SeedingHistoryCard({ campaigns }: Props) {
  const stats = useMemo(() => {
    const totalCost = campaigns.reduce((sum, c) => sum + (c.cost ?? 0), 0);
    const totalViews = campaigns.reduce((sum, c) => sum + (c.result_views ?? 0), 0);
    const totalLikes = campaigns.reduce((sum, c) => sum + (c.result_likes ?? 0), 0);
    const withViews = campaigns.filter((c) => c.result_views !== null);
    const avgViews = withViews.length > 0 ? totalViews / withViews.length : null;
    const costPer10k = totalViews > 0 ? Math.round(totalCost / (totalViews / 10_000)) : null;
    return {
      count: campaigns.length,
      totalCost,
      totalViews,
      totalLikes,
      avgViews,
      costPer10k,
    };
  }, [campaigns]);

  if (stats.count === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        자사 시딩 실적
      </h4>
      <div className="bg-violet-50/60 rounded-xl p-3 border border-violet-100 space-y-1.5">
        <div className="flex gap-3 text-[11px] text-slate-600 flex-wrap tabular-nums">
          <span>시딩 {stats.count}회</span>
          <span>총 원가 {formatKRW(stats.totalCost)}</span>
          <span>총 조회 {formatCount(stats.totalViews)}</span>
          <span>총 좋아요 {formatCount(stats.totalLikes)}</span>
        </div>
        <div className="flex gap-3 text-[11px] flex-wrap tabular-nums">
          <span className="text-slate-500">
            평균 조회 {stats.avgViews === null ? "—" : formatCount(Math.round(stats.avgViews))}
          </span>
          <span className="font-semibold text-violet-700">
            1만 조회당{" "}
            {stats.costPer10k === null ? "—" : `${stats.costPer10k.toLocaleString()}원`}
          </span>
        </div>
        {stats.totalViews === 0 && (
          <p className="text-[11px] text-slate-400">
            성과가 아직 없습니다. 게시물을 연결하고 성과를 새로고침해보세요.
          </p>
        )}
      </div>
    </div>
  );
}
