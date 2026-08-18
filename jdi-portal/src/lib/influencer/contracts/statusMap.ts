// 계약 10단계 ↔ 시딩 캠페인 6단계 대응표. **클라이언트/서버 공용**이라 서버 전용
// import(next/cache, supabase 서버 클라이언트)를 절대 넣지 않는다 — 리스트·시딩
// 스케줄 화면이 이 파일을 직접 가져다 쓴다(linkSync.ts 는 서버 전용이라 못 쓴다).

import type { CampaignStatus } from "@/lib/influencer/types";
import type { ContractStatus } from "./types";

/**
 * 계약 상태 → 시딩 캠페인 상태 매핑.
 * 계약 10단계가 캠페인 6단계로 좁아지므로 여러 계약 상태가 한 칸으로 모인다.
 * 그래서 화면에서는 언제나 계약 상태를 그대로 보여주고, 이 표는 캠페인 행에
 * 값을 써 넣을 때만 쓴다(캘린더·타임라인이 캠페인 상태로 색을 고른다).
 */
export const CONTRACT_TO_CAMPAIGN_STATUS: Record<
  Exclude<ContractStatus, "canceled">,
  CampaignStatus
> = {
  candidate: "planned",
  dm_sent: "dm_sent",
  negotiating: "replied",
  contract_sent: "replied",
  signed: "replied",
  product_shipped: "shipped",
  draft_received: "shipped",
  posted: "posted",
  settled: "done",
};

/**
 * 캠페인 상태 → 계약 상태 역매핑(대표값).
 * 한 캠페인 상태에 계약 상태 여럿이 대응하므로, 지금 계약 상태가 이미 같은 묶음
 * 안에 있으면 그대로 두고(더 자세한 정보를 잃지 않는다) 아니면 대표값으로 옮긴다.
 */
export const CAMPAIGN_TO_CONTRACT_GROUP: Record<CampaignStatus, ContractStatus[]> = {
  planned: ["candidate"],
  dm_sent: ["dm_sent"],
  replied: ["negotiating", "contract_sent", "signed"],
  shipped: ["product_shipped", "draft_received"],
  posted: ["posted"],
  done: ["settled"],
};

/**
 * 캠페인 상태 변경을 계약 상태로 옮긴다.
 * 취소된 계약은 캠페인 조작으로 되살리지 않는다(취소는 계약 탭에서만 푼다).
 */
export function resolveContractStatus(
  current: ContractStatus,
  next: CampaignStatus,
): ContractStatus {
  if (current === "canceled") return current;
  const group = CAMPAIGN_TO_CONTRACT_GROUP[next];
  if (!group) return current;
  return group.includes(current) ? current : group[0];
}

/**
 * 캠페인 6단계 → 계약 10단계 대표값. **화면 표시 전용 안전망**이다.
 *
 * 지금은 시딩 1건 = 계약 1건이라 계약 없는 캠페인이 새로 생기지 않지만,
 * 예전에 만들어진 캠페인이 남아 있어도 리스트·스케줄·깔때기가 모두 같은
 * 10단계 이름으로 보이도록 이 함수를 거쳐 표시한다.
 */
export function campaignToContractStatus(status: CampaignStatus): ContractStatus {
  return CAMPAIGN_TO_CONTRACT_GROUP[status]?.[0] ?? "candidate";
}
