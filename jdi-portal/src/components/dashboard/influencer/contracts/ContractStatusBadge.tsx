import {
  CONTRACT_STATUS_BADGE_CLASSES,
  CONTRACT_STATUS_LABEL,
} from "@/lib/influencer/contracts/labels";
import type { ContractStatus } from "@/lib/influencer/contracts/types";

/** 계약 상태 배지 — 색/라벨은 labels.ts 단일 소스 */
export default function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const label = CONTRACT_STATUS_LABEL[status] ?? status;
  const classes = CONTRACT_STATUS_BADGE_CLASSES[status] ?? "bg-slate-100 text-slate-500";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${classes}`}
      aria-label={`상태: ${label}`}
    >
      {label}
    </span>
  );
}
