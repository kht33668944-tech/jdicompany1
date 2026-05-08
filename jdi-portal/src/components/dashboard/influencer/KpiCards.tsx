import type { KpiCards as KpiCardsType } from "@/lib/influencer/types";

interface Props {
  data: KpiCardsType;
}

function formatNumber(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("ko-KR");
}

function formatRate(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(2)}%`;
}

function formatPercent(n: number | null): string {
  if (n === null) return "—";
  return `${Math.round(n)}%`;
}

interface DeltaBadgeProps {
  current: number | null;
  prev: number | null;
  formatFn?: (n: number) => string;
}

function DeltaBadge({ current, prev, formatFn }: DeltaBadgeProps) {
  if (current === null || prev === null) return <span className="text-xs text-slate-400">—</span>;
  const delta = current - prev;
  if (Math.abs(delta) < 0.001) return <span className="text-xs text-slate-400">변동없음</span>;
  const isPositive = delta > 0;
  const label = formatFn ? (isPositive ? `+${formatFn(delta)}` : formatFn(delta)) : (isPositive ? `+${delta.toFixed(1)}` : delta.toFixed(1));
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        isPositive
          ? "bg-green-50 text-green-600"
          : "bg-rose-50 text-rose-600"
      }`}
    >
      {label}
    </span>
  );
}

interface CardProps {
  title: string;
  value: string;
  delta?: React.ReactNode;
}

function KpiCard({ title, value, delta }: CardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col gap-3">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-bold text-slate-800 leading-none">{value}</p>
      {delta}
    </div>
  );
}

export default function KpiCards({ data }: Props) {
  const totalDelta = data.prevWeek.totalInfluencers !== null
    ? data.totalInfluencers - (data.prevWeek.totalInfluencers ?? 0)
    : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="전체 인플루언서"
        value={formatNumber(data.totalInfluencers)}
        delta={
          totalDelta !== null ? (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                totalDelta >= 0 ? "bg-green-50 text-green-600" : "bg-rose-50 text-rose-600"
              }`}
            >
              {totalDelta >= 0 ? `+${totalDelta}` : totalDelta}명
            </span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )
        }
      />
      <KpiCard
        title="평균 Engagement Rate"
        value={formatRate(data.avgEngagementRate)}
        delta={
          <DeltaBadge
            current={data.avgEngagementRate}
            prev={data.prevWeek.avgEngagementRate}
            formatFn={(n) => `${n.toFixed(2)}%`}
          />
        }
      />
      <KpiCard
        title="예상 총 도달 (Reach)"
        value={formatNumber(data.totalFollowerReach)}
        delta={
          <DeltaBadge
            current={data.totalFollowerReach}
            prev={data.prevWeek.totalFollowerReach}
            formatFn={(n) => formatNumber(Math.round(n))}
          />
        }
      />
      <KpiCard
        title="활성 캠페인"
        value={formatPercent(data.activeCampaigns)}
        delta={
          <DeltaBadge
            current={data.activeCampaigns}
            prev={data.prevWeek.activeCampaigns}
            formatFn={(n) => String(Math.round(n))}
          />
        }
      />
    </div>
  );
}
