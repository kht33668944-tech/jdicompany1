import UsersThree from "phosphor-react/dist/icons/UsersThree.esm.js";
import PaperPlaneTilt from "phosphor-react/dist/icons/PaperPlaneTilt.esm.js";
import CheckCircle from "phosphor-react/dist/icons/CheckCircle.esm.js";
import CurrencyKrw from "phosphor-react/dist/icons/CurrencyKrw.esm.js";
import type { KpiCards as KpiCardsType } from "@/lib/influencer/types";
import { formatKRW } from "@/lib/influencer/format";

interface Props {
  data: KpiCardsType;
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
  icon: React.ReactNode;
  iconBg: string;
}

function KpiCard({ title, value, delta, icon, iconBg }: CardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-3 py-2.5 flex items-center gap-3">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-slate-500 truncate">{title}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="text-lg font-bold text-slate-800 leading-tight">{value}</p>
          {delta}
        </div>
      </div>
    </div>
  );
}

export default function KpiCards({ data }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <KpiCard
        title="전체 인플루언서"
        value={String(data.totalInfluencers.value)}
        delta={<DeltaBadge deltaPct={data.totalInfluencers.deltaPct} />}
        icon={<UsersThree size={16} weight="duotone" className="text-blue-600" />}
        iconBg="bg-blue-50"
      />
      <KpiCard
        title="시딩 중 캠페인"
        value={`${data.activeCampaigns.value}건`}
        delta={null}
        icon={<PaperPlaneTilt size={16} weight="duotone" className="text-cyan-600" />}
        iconBg="bg-cyan-50"
      />
      <KpiCard
        title="완료 캠페인"
        value={`${data.doneCampaigns.value}건`}
        delta={null}
        icon={<CheckCircle size={16} weight="duotone" className="text-emerald-600" />}
        iconBg="bg-emerald-50"
      />
      <KpiCard
        title="총 시딩 금액"
        value={formatKRW(data.totalSeedingCost.value)}
        delta={null}
        icon={<CurrencyKrw size={16} weight="duotone" className="text-amber-600" />}
        iconBg="bg-amber-50"
      />
    </div>
  );
}
