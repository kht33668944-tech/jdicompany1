import type { CampaignStatus, InfluencerStatus } from "@/lib/influencer/types";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/influencer/labels";

type AllStatus = CampaignStatus | InfluencerStatus;

type Props = {
  status: AllStatus;
  type?: "influencer" | "campaign";
};

interface BadgeConfig {
  label: string;
  classes: string;
}

const CAMPAIGN_CONFIG: Record<CampaignStatus, BadgeConfig> = {
  planned: {
    label: CAMPAIGN_STATUS_LABEL.planned,
    classes: "bg-slate-100 text-slate-600",
  },
  dm_sent: {
    label: CAMPAIGN_STATUS_LABEL.dm_sent,
    classes: "bg-blue-100 text-blue-700",
  },
  replied: {
    label: CAMPAIGN_STATUS_LABEL.replied,
    classes: "bg-purple-100 text-purple-700",
  },
  shipped: {
    label: CAMPAIGN_STATUS_LABEL.shipped,
    classes: "bg-cyan-100 text-cyan-700",
  },
  posted: {
    label: CAMPAIGN_STATUS_LABEL.posted,
    classes: "bg-emerald-100 text-emerald-700",
  },
  done: {
    label: CAMPAIGN_STATUS_LABEL.done,
    classes: "bg-slate-100 text-slate-500",
  },
};

const INFLUENCER_CONFIG: Record<InfluencerStatus, BadgeConfig> = {
  active: {
    label: "활성",
    classes: "bg-emerald-100 text-emerald-700",
  },
  archived: {
    label: "보관",
    classes: "bg-slate-100 text-slate-500",
  },
};

export default function StatusBadge({ status, type = "campaign" }: Props) {
  let config: BadgeConfig;

  if (type === "influencer") {
    config = INFLUENCER_CONFIG[status as InfluencerStatus] ?? {
      label: status,
      classes: "bg-slate-100 text-slate-500",
    };
  } else {
    config = CAMPAIGN_CONFIG[status as CampaignStatus] ?? {
      label: status,
      classes: "bg-slate-100 text-slate-500",
    };
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.classes}`}
      aria-label={`상태: ${config.label}`}
    >
      {config.label}
    </span>
  );
}
