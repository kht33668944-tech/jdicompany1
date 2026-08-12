import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthUser } from "@/lib/supabase/auth";
import { getContracts, getSettlementContractIds } from "@/lib/influencer/contracts/queries";
import { isGateConfigured } from "@/lib/vault/queries";
import { verifyUnlockToken } from "@/lib/vault/crypto";
import { VAULT_UNLOCK_COOKIE } from "@/lib/vault/constants";
import ContractsPageClient from "@/components/dashboard/influencer/contracts/ContractsPageClient";

export const metadata = { title: "TMA 계약 관리 | JDI" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  // 리스트 탭 "TMA 계약 만들기" → ?prefillId=...&prefillName=...&prefillHandle=...
  const params = await searchParams;
  const prefillId = typeof params.prefillId === "string" ? params.prefillId : "";
  const prefill =
    prefillId && UUID_RE.test(prefillId)
      ? {
          influencerId: prefillId,
          name: typeof params.prefillName === "string" ? params.prefillName : "",
          handle: typeof params.prefillHandle === "string" ? params.prefillHandle : "",
        }
      : null;

  try {
    const [contracts, settlementContractIds, gateConfigured] = await Promise.all([
      getContracts(),
      getSettlementContractIds(),
      isGateConfigured(auth.supabase),
    ]);

    // 보관함과 같은 2차 비밀번호 잠금 쿠키 — 이미 풀려 있으면 정산 정보 섹션이 바로 열린다
    const store = await cookies();
    const unlockToken = store.get(VAULT_UNLOCK_COOKIE)?.value;
    const initialUnlocked = verifyUnlockToken(unlockToken, auth.user.id);

    return (
      <ContractsPageClient
        contracts={contracts}
        settlementContractIds={settlementContractIds}
        gateConfigured={gateConfigured}
        initialUnlocked={initialUnlocked}
        prefill={prefill}
      />
    );
  } catch (error) {
    console.error("[influencer-contracts] 초기 데이터 로드 실패", error);
    return (
      <div className="p-6">
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-sm text-red-600">
          계약 데이터를 불러오지 못했습니다. 잠시 후 새로고침해주세요.
        </div>
      </div>
    );
  }
}
