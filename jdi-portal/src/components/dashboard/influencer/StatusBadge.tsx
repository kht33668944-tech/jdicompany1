import type { CampaignStatus, InfluencerStatus } from "@/lib/influencer/types";

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
    label: "접촉 전",
    classes: "bg-slate-100 text-slate-600",
  },
  dm_sent: {
    label: "DM 발송",
    classes: "bg-blue-100 text-blue-700",
  },
  replied: {
    label: "응답 받음",
    classes: "bg-purple-100 text-purple-700",
  },
  shipped: {
    label: "제품 발송",
    classes: "bg-cyan-100 text-cyan-700",
  },
  posted: {
    label: "게시 완료",
    classes: "bg-emerald-100 text-emerald-700",
  },
  done: {
    label: "완료",
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
