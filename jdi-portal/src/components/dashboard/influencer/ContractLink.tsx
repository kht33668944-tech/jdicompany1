"use client";

// 리스트 표·시딩 스케줄 보드에서 TMA 계약으로 바로 건너뛰는 표시.
// 예전에는 리스트만 봐서는 이 사람에게 계약이 있는지조차 알 수 없었고,
// 시딩 스케줄에는 계약으로 가는 길이 아예 없었다. 두 화면이 같은 버튼을 쓴다.

import { useRouter } from "next/navigation";
import { CONTRACT_STATUS_LABEL } from "@/lib/influencer/contracts/labels";
import type { ContractListSummary } from "@/lib/influencer/contracts/types";

export default function ContractLink({
  contract,
}: {
  contract: ContractListSummary | undefined;
}) {
  const router = useRouter();
  if (!contract) return null;

  const title =
    `TMA 계약: ${CONTRACT_STATUS_LABEL[contract.contract_status]}` +
    (contract.has_settlement ? " · 정산정보 등록됨" : " · 정산정보 미등록");

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        router.push(`/dashboard/influencer/contracts?openId=${contract.contract_id}`);
      }}
      className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 transition-colors hover:border-blue-300 hover:text-blue-600"
    >
      📄 계약
      {contract.has_settlement && <span className="text-emerald-500" aria-hidden>✓</span>}
    </button>
  );
}
