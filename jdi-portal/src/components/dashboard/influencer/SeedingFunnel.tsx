"use client";

import { useMemo } from "react";
import type { CampaignBasic } from "@/lib/influencer/types";
import type { ContractListSummary, ContractStatus } from "@/lib/influencer/contracts/types";
import type { FilterState } from "./InfluencerFilters";
import {
  CONTRACT_STATUS_DOT_CLASSES,
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_ORDER,
} from "@/lib/influencer/contracts/labels";
import { campaignToContractStatus } from "@/lib/influencer/contracts/statusMap";

interface Props {
  /**
   * 완료까지 포함한 전체 시딩건.
   * 예전에는 '진행 중'만 받아서 세는 바람에 마지막 칸이 구조적으로 늘 0이었다.
   */
  allCampaigns: CampaignBasic[];
  /** influencer_id → 계약 요약. 계약 상태가 이 사람의 진짜 상태다. */
  contractByInfluencer: Map<string, ContractListSummary>;
  /** 전체 활성 인플루언서 수 — '대기'는 화면에 불러온 25명이 아니라 전체 기준이어야 한다 */
  totalInfluencerCount: number;
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
}

/** 단계별 아이콘 — 계약 10단계와 1:1 (라벨·색은 labels.ts 단일 소스를 쓴다) */
const STATUS_ICONS: Record<ContractStatus, string> = {
  candidate: "🙋",
  dm_sent: "📩",
  negotiating: "🤝",
  contract_sent: "📤",
  signed: "✍️",
  product_shipped: "📦",
  draft_received: "🎬",
  posted: "📸",
  settled: "✅",
  canceled: "🚫",
};

export default function SeedingFunnel({
  allCampaigns,
  contractByInfluencer,
  totalInfluencerCount,
  filters,
  onFiltersChange,
}: Props) {
  const { waiting, statusCounts } = useMemo(() => {
    const counts = Object.fromEntries(
      CONTRACT_STATUS_ORDER.map((s) => [s, 0]),
    ) as Record<ContractStatus, number>;

    // 진행 중인 사람 = 시딩건이 있거나 계약이 있는 사람.
    // 시딩 1건 = 계약 1건이라 보통 같은 집합이지만, 동기화가 한 번 실패했더라도
    // 어느 한쪽에만 있는 사람이 조용히 빠지지 않도록 둘을 합쳐서 센다.
    const seen = new Set<string>();

    for (const c of allCampaigns) {
      if (seen.has(c.influencer_id)) continue;
      seen.add(c.influencer_id);
      const linked = contractByInfluencer.get(c.influencer_id);
      const status = linked ? linked.contract_status : campaignToContractStatus(c.status);
      counts[status] += 1;
    }
    for (const [influencerId, contract] of contractByInfluencer) {
      if (seen.has(influencerId)) continue;
      seen.add(influencerId);
      counts[contract.contract_status] += 1;
    }

    // 보관된 인플루언서의 옛 시딩건이 섞일 수 있어 음수 방지로 0에서 자른다
    return { waiting: Math.max(0, totalInfluencerCount - seen.size), statusCounts: counts };
  }, [allCampaigns, contractByInfluencer, totalInfluencerCount]);

  // '취소'는 실제로 취소한 건이 있을 때만 보여준다(평소 0으로 자리만 차지하지 않게)
  const steps = CONTRACT_STATUS_ORDER.filter(
    (s) => s !== "canceled" || statusCounts.canceled > 0,
  );

  function toggleStatus(status: ContractStatus) {
    const next = filters.contractStatuses.includes(status)
      ? filters.contractStatuses.filter((s) => s !== status)
      : [...filters.contractStatuses, status];
    onFiltersChange({ ...filters, contractStatuses: next });
  }

  return (
    <div className="flex flex-col gap-0.5">
      {/* 대기 — 아직 시딩을 시작하지 않은 사람 */}
      <button
        type="button"
        onClick={() => onFiltersChange({ ...filters, noCampaign: !filters.noCampaign })}
        aria-pressed={filters.noCampaign}
        className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors ${
          filters.noCampaign ? "bg-slate-50 ring-1 ring-slate-200" : "hover:bg-slate-50"
        }`}
      >
        <span className="w-6 text-base leading-none" aria-hidden>⏳</span>
        <span
          className={`flex-1 text-sm text-left truncate ${
            waiting === 0 ? "text-slate-400" : "text-slate-700 font-medium"
          }`}
        >
          대기
        </span>
        <span className="flex items-baseline gap-0.5 tabular-nums">
          <span
            className={`text-lg font-bold tracking-tight ${
              waiting === 0 ? "text-slate-300" : "text-slate-900"
            }`}
          >
            {waiting}
          </span>
          <span className={`text-[10px] ${waiting === 0 ? "text-slate-300" : "text-slate-400"}`}>
            명
          </span>
        </span>
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            waiting === 0 ? "border border-slate-300 bg-transparent" : "bg-slate-400"
          }`}
        />
      </button>

      {/* 계약 10단계 — 리스트 배지·필터·계약 탭과 같은 이름을 쓴다 */}
      {steps.map((status) => {
        const count = statusCounts[status];
        const active = filters.contractStatuses.includes(status);
        const isEmpty = count === 0;

        return (
          <button
            key={status}
            type="button"
            onClick={() => toggleStatus(status)}
            aria-pressed={active}
            className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors ${
              active ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50"
            }`}
          >
            <span className="w-6 text-base leading-none" aria-hidden>
              {STATUS_ICONS[status]}
            </span>
            <span
              className={`flex-1 text-sm text-left truncate ${
                isEmpty ? "text-slate-400" : "text-slate-700 font-medium"
              }`}
            >
              {CONTRACT_STATUS_LABEL[status]}
            </span>
            <span className="flex items-baseline gap-0.5 tabular-nums">
              <span
                className={`text-lg font-bold tracking-tight ${
                  isEmpty ? "text-slate-300" : "text-slate-900"
                }`}
              >
                {count}
              </span>
              <span className={`text-[10px] ${isEmpty ? "text-slate-300" : "text-slate-400"}`}>
                건
              </span>
            </span>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isEmpty ? "border border-slate-300 bg-transparent" : CONTRACT_STATUS_DOT_CLASSES[status]
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
