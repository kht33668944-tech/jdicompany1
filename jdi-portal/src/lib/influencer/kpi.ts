import type { KpiCards } from "./types";

export interface KpiRpcResult {
  total_count: number | null;
  prev_total_count: number | null;
  active_campaign_count: number | null;
  done_campaign_count: number | null;
  total_seeding_cost: number | null;
}

export function calcDeltaPct(current: number | null, prev: number | null): number | null {
  if (current === null || prev === null || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

export function mapKpiRpcResult(row: KpiRpcResult): KpiCards {
  const totalCount = row.total_count ?? 0;
  return {
    totalInfluencers: {
      value: totalCount,
      deltaPct: calcDeltaPct(totalCount, row.prev_total_count ?? null),
    },
    activeCampaigns: { value: row.active_campaign_count ?? 0 },
    doneCampaigns: { value: row.done_campaign_count ?? 0 },
    totalSeedingCost: { value: row.total_seeding_cost ?? 0 },
  };
}
