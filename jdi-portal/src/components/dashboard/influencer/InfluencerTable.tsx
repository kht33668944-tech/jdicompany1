"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import DotsThreeVertical from "phosphor-react/dist/icons/DotsThreeVertical.esm.js";
import ArrowsClockwise from "phosphor-react/dist/icons/ArrowsClockwise.esm.js";
import Archive from "phosphor-react/dist/icons/Archive.esm.js";
import Trash from "phosphor-react/dist/icons/Trash.esm.js";
import Eye from "phosphor-react/dist/icons/Eye.esm.js";
import GradeBadge from "./GradeBadge";
import StatusBadge from "./StatusBadge";
import { updateCampaignStatus, resyncInfluencer, archiveInfluencer, deleteInfluencer } from "@/lib/influencer/actions";
import type { Influencer, InfluencerCampaign, CampaignStatus } from "@/lib/influencer/types";
import type { FilterState } from "./InfluencerFilters";

function formatFollowers(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("ko-KR");
}

function formatEngagementRate(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(1)}%`;
}

const CAMPAIGN_STATUS_OPTIONS: { value: CampaignStatus; label: string }[] = [
  { value: "planned", label: "예정" },
  { value: "dm_sent", label: "DM 발송" },
  { value: "replied", label: "회신" },
  { value: "shipped", label: "발송완료" },
  { value: "posted", label: "게시됨" },
  { value: "done", label: "완료" },
];

interface RowMenuProps {
  influencerId: string;
  onViewDetail: () => void;
  onRefresh: () => void;
}

function RowMenu({ influencerId, onViewDetail, onRefresh }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function handleResync() {
    setOpen(false);
    startTransition(async () => {
      const id = toast.loading("재동기화 중...");
      try {
        await resyncInfluencer(influencerId);
        toast.success("재동기화 완료", { id });
        onRefresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "재동기화 실패", { id });
      }
    });
  }

  function handleArchive() {
    setOpen(false);
    startTransition(async () => {
      const id = toast.loading("보관 처리 중...");
      try {
        await archiveInfluencer(influencerId);
        toast.success("보관되었습니다", { id });
        onRefresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "보관 실패", { id });
      }
    });
  }

  function handleDelete() {
    setOpen(false);
    if (!confirm("정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    startTransition(async () => {
      const id = toast.loading("삭제 중...");
      try {
        await deleteInfluencer(influencerId);
        toast.success("삭제되었습니다", { id });
        onRefresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패", { id });
      }
    });
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
      >
        <DotsThreeVertical size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-30 w-40 bg-white rounded-xl shadow-lg border border-slate-100 py-1 text-sm">
            <button
              onClick={(e) => { e.stopPropagation(); onViewDetail(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Eye size={14} /> 상세보기
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleResync(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ArrowsClockwise size={14} /> 재동기화
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleArchive(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Archive size={14} /> 보관
            </button>
            <hr className="my-1 border-slate-100" />
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <Trash size={14} /> 삭제
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface StatusCellProps {
  campaign: InfluencerCampaign | undefined;
}

function StatusCell({ campaign }: StatusCellProps) {
  const [, startTransition] = useTransition();

  if (!campaign) {
    return <span className="text-slate-300 text-sm">—</span>;
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation();
    const next = e.target.value as CampaignStatus;
    startTransition(async () => {
      try {
        await updateCampaignStatus(campaign!.id, next);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "상태 변경 실패");
      }
    });
  }

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <StatusBadge status={campaign.status} type="campaign" />
      <select
        value={campaign.status}
        onChange={handleChange}
        className="text-xs text-slate-500 bg-transparent border-none outline-none cursor-pointer hover:text-slate-700"
      >
        {CAMPAIGN_STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

interface Props {
  influencers: Influencer[];
  activeCampaigns: InfluencerCampaign[];
  filters: FilterState;
  onSelectInfluencer: (id: string) => void;
  onRefresh: () => void;
}

export default function InfluencerTable({ influencers, activeCampaigns, filters, onSelectInfluencer, onRefresh }: Props) {
  // 캠페인 맵: influencer_id → 최신 active 캠페인
  const campaignMap = new Map<string, InfluencerCampaign>();
  for (const c of activeCampaigns) {
    if (!campaignMap.has(c.influencer_id)) {
      campaignMap.set(c.influencer_id, c);
    }
  }

  // 클라이언트 필터링
  const filtered = influencers.filter((inf) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (
        !inf.username.toLowerCase().includes(q) &&
        !(inf.display_name ?? "").toLowerCase().includes(q)
      ) return false;
    }
    if (filters.grades.length > 0 && !filters.grades.includes(inf.grade)) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(inf.category ?? "")) return false;
    if (filters.status !== "all" && inf.status !== filters.status) return false;
    if (filters.tags.length > 0) {
      const infTags = inf.tags ?? [];
      if (!filters.tags.every((t) => infTags.includes(t))) return false;
    }
    return true;
  });

  // 정렬: engagement_rate desc (서버에서 이미 정렬됐지만 필터 후 재정렬)
  const sorted = [...filtered].sort(
    (a, b) => (b.engagement_rate ?? -1) - (a.engagement_rate ?? -1)
  );

  const displayed = sorted.slice(0, 50);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-800">
          인플루언서 리스트 관리
          <span className="ml-2 text-xs font-normal text-slate-400">{filtered.length}명</span>
        </h2>
        <Link
          href="/dashboard/influencer/all"
          className="text-xs text-slate-500 hover:text-slate-700 transition-colors font-medium"
        >
          전체보기 →
        </Link>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">인플루언서</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">ER</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">팔로워</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">AI 등급</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">상태</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400">
                  인플루언서가 없습니다. URL을 입력해 첫 번째 인플루언서를 추가해 보세요.
                </td>
              </tr>
            ) : (
              displayed.map((inf) => (
                <tr
                  key={inf.id}
                  onClick={() => onSelectInfluencer(inf.id)}
                  className="hover:bg-slate-50/60 cursor-pointer transition-colors group"
                >
                  {/* 인플루언서 */}
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      {/* 프로필 이미지 */}
                      <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden shrink-0 ring-1 ring-slate-100">
                        {inf.profile_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={inf.profile_image_url}
                            alt={inf.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-400">
                            {inf.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      {/* 이름 */}
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">@{inf.username}</p>
                        {inf.category && (
                          <p className="text-xs text-slate-400 truncate">{inf.category}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* ER */}
                  <td className="px-4 py-3 text-right font-medium text-slate-700 tabular-nums">
                    {formatEngagementRate(inf.engagement_rate)}
                  </td>

                  {/* 팔로워 */}
                  <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                    {formatFollowers(inf.follower_count)}
                  </td>

                  {/* AI 등급 */}
                  <td className="px-4 py-3 text-center">
                    <GradeBadge grade={inf.grade} />
                  </td>

                  {/* 상태 */}
                  <td className="px-4 py-3">
                    <StatusCell campaign={campaignMap.get(inf.id)} />
                  </td>

                  {/* 메뉴 */}
                  <td className="px-4 py-3">
                    <RowMenu
                      influencerId={inf.id}
                      onViewDetail={() => onSelectInfluencer(inf.id)}
                      onRefresh={onRefresh}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > 50 && (
        <div className="px-6 py-3 border-t border-slate-100 text-center text-xs text-slate-400">
          상위 50명 표시 중 — 전체보기에서 모든 인플루언서를 확인하세요
        </div>
      )}
    </div>
  );
}
