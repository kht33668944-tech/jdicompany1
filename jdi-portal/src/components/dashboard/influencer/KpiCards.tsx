import type { KpiCards as KpiCardsType } from "@/lib/influencer/types";
import UsersThree from "phosphor-react/dist/icons/UsersThree.esm.js";
import ChartLineUp from "phosphor-react/dist/icons/ChartLineUp.esm.js";
import Broadcast from "phosphor-react/dist/icons/Broadcast.esm.js";
import RocketLaunch from "phosphor-react/dist/icons/RocketLaunch.esm.js";

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
  if (deltaPct === null) return <span className="text-xs text-slate-400">—</span>;
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
  delta?: React.ReactNode;
  icon: React.ReactNode;
  iconBg: string;
}

function KpiCard({ title, value, delta, icon, iconBg }: CardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-800 leading-none">{value}</p>
      {delta}
    </div>
  );
}

export default function KpiCards({ data }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="전체 인플루언서"
        value={formatNumber(data.totalInfluencers.value)}
        delta={<DeltaBadge deltaPct={data.totalInfluencers.deltaPct} />}
        icon={<UsersThree size={16} weight="fill" className="text-blue-600" />}
        iconBg="bg-blue-50"
      />
      <KpiCard
        title="평균 Engagement Rate"
        value={formatRate(data.avgEngagementRate.value)}
        delta={<DeltaBadge deltaPct={data.avgEngagementRate.deltaPct} />}
        icon={<ChartLineUp size={16} weight="fill" className="text-emerald-600" />}
        iconBg="bg-emerald-50"
      />
      <KpiCard
        title="예상 총 도달 (Reach)"
        value={formatNumber(data.estimatedReach.value)}
        delta={<DeltaBadge deltaPct={data.estimatedReach.deltaPct} />}
        icon={<Broadcast size={16} weight="fill" className="text-violet-600" />}
        iconBg="bg-violet-50"
      />
      <KpiCard
        title="시딩 진행률"
        value={formatPercent(data.campaignProgressRate.value)}
        delta={<DeltaBadge deltaPct={data.campaignProgressRate.deltaPct} />}
        icon={<RocketLaunch size={16} weight="fill" className="text-amber-600" />}
        iconBg="bg-amber-50"
      />
    </div>
  );
}
