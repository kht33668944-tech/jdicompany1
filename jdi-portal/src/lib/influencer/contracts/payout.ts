// 정산 지급액/원천징수 계산 — 순수 함수만 둔다(정적 테스트 대상).
// 지급액 = 광고비(광고비형만) + 2차 활용 추가비용 + 촬영 원본 추가비용.
// 순수협찬형은 제품만 제공하므로 현금 지급액이 0일 수 있다.

import type { InfluencerContract, SettlementType } from "./types";

type PayoutFields = Pick<
  InfluencerContract,
  | "collab_type"
  | "ad_fee_total"
  | "secondary_usage"
  | "secondary_usage_fee"
  | "raw_footage"
  | "raw_footage_fee"
>;

/** 사업소득 원천징수율 3.3% (소득세 3% + 지방소득세 0.3%) — 개인 정산에만 적용 */
export const WITHHOLDING_RATE = 0.033;

/** 이 계약으로 현금 지급할 총액(원) */
export function getContractPayout(c: PayoutFields): number {
  return (
    (c.collab_type === "paid" ? (c.ad_fee_total ?? 0) : 0) +
    (c.secondary_usage === "paid" ? (c.secondary_usage_fee ?? 0) : 0) +
    (c.raw_footage === "paid" ? (c.raw_footage_fee ?? 0) : 0)
  );
}

/** 원천징수액(원). 개인만 3.3%, 사업자는 세금계산서 처리라 0. */
export function getWithholding(payout: number, settlementType: SettlementType | null): number {
  if (settlementType !== "individual" || payout <= 0) return 0;
  return Math.round(payout * WITHHOLDING_RATE);
}
