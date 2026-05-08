import type { CampaignStatus } from "./types";

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  planned: "협의중",
  dm_sent: "DM 발송",
  replied: "응답 받음",
  shipped: "발송완료",
  posted: "포스팅 완료",
  done: "완료",
};

export const CAMPAIGN_STATUS_ORDER: CampaignStatus[] = [
  "planned",
  "dm_sent",
  "replied",
  "shipped",
  "posted",
  "done",
];

export const CAMPAIGN_STATUS_OPTIONS: { value: CampaignStatus; label: string }[] =
  CAMPAIGN_STATUS_ORDER.map((value) => ({ value, label: CAMPAIGN_STATUS_LABEL[value] }));
