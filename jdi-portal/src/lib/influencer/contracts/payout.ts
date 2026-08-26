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

/**
 * 화면에 「계약 금액」으로 보여주는 값 — 광고비형은 광고비 총액, 순수협찬형은 약정가액.
 *
 * 리스트·시딩 스케줄·TMA 계약 탭이 **같은 숫자**를 보여줘야 해서 규칙을 여기 한 곳에만 둔다.
 * 시딩건(`influencer_campaigns.cost`)에 사본을 남기는 동기화(linkSync.syncCampaign)와
 * 마이그레이션 125 의 DB 트리거도 이 규칙을 그대로 따른다 — 셋 중 하나만 바꾸면 어긋난다.
 *
 * 지급액(getContractPayout)과는 다르다: 이쪽은 2차 활용비·원본비를 더하지 않는다.
 */
export function getContractAmount(
  c: Pick<InfluencerContract, "collab_type" | "ad_fee_total" | "agreed_value">,
): number | null {
  return c[getContractAmountColumn(c.collab_type)];
}

/**
 * 협업 유형별로 「계약 금액」이 들어 있는 칸 이름 — 값을 되돌려 쓸 때(캠페인 → 계약 역동기화)
 * 쓴다. getContractAmount 와 짝이라 규칙이 갈라지지 않는다.
 */
export function getContractAmountColumn(
  collabType: InfluencerContract["collab_type"],
): "ad_fee_total" | "agreed_value" {
  return collabType === "paid" ? "ad_fee_total" : "agreed_value";
}
