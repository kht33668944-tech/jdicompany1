import type { KpiCards as KpiCardsType } from "@/lib/influencer/types";

interface Props {
  data: KpiCardsType;
}

function formatNumber(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatRate(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(2)}%`;
}

function formatPercent(n: number | null): string {
  if (n === null) return "—";
  return `${Math.round(n)}%`;
}

function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) return <span className="text-xs text-slate-300">—</span>;
  if (Math.abs(deltaPct) < 0.1) return <span className="text-xs text-slate-400">변동없음</span>;
  const isPositive = deltaPct > 0;
  const label = `${isPositive ? "+" : ""}${deltaPct.toFixed(1)}%`;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        isPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
      }`}
    >
      {label}
    </span>
  );
}

interface CardProps {
  title: string;
  value: string;
  delta: React.ReactNode;
}

function KpiCard({ title, value, delta }: CardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide truncate">{title}</p>
        {delta}
      </div>
      <p className="text-xl font-bold text-slate-800 leading-tight">{value}</p>
    </div>
  );
}

export default function KpiCards({ data }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        title="전체 인플루언서"
        value={formatNumber(data.totalInfluencers.value)}
        delta={<DeltaBadge deltaPct={data.totalInfluencers.deltaPct} />}
      />
      <KpiCard
        title="평균 Engagement Rate"
        value={formatRate(data.avgEngagementRate.value)}
        delta={<DeltaBadge deltaPct={data.avgEngagementRate.deltaPct} />}
      />
      <KpiCard
        title="예상 총 도달 (Reach)"
        value={formatNumber(data.estimatedReach.value)}
        delta={<DeltaBadge deltaPct={data.estimatedReach.deltaPct} />}
      />
      <KpiCard
        title="시딩 진행률"
        value={formatPercent(data.campaignProgressRate.value)}
        delta={<DeltaBadge deltaPct={data.campaignProgressRate.deltaPct} />}
      />
    </div>
  );
}
