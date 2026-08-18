import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthUser } from "@/lib/supabase/auth";
import { getContracts, getSettlementContractIds } from "@/lib/influencer/contracts/queries";
import { getInfluencerStats } from "@/lib/influencer/queries";
import { isGateConfigured } from "@/lib/vault/queries";
import { verifyUnlockToken } from "@/lib/vault/crypto";
import { VAULT_UNLOCK_COOKIE } from "@/lib/vault/constants";
import ContractsPageClient from "@/components/dashboard/influencer/contracts/ContractsPageClient";
import { UUID_RE } from "@/lib/influencer/contracts/constants";

export const metadata = { title: "TMA 계약 관리 | JDI" };

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

  // 리스트 탭의 「📄 계약」 배지 → ?openId=... 로 그 계약 상세를 바로 연다
  const openIdParam = typeof params.openId === "string" ? params.openId : "";
  const openId = openIdParam && UUID_RE.test(openIdParam) ? openIdParam : null;

  try {
    const [contracts, settlementContractIds, gateConfigured] = await Promise.all([
      getContracts(),
      getSettlementContractIds(),
      isGateConfigured(auth.supabase),
    ]);

    // 계약 표에도 리스트의 지표(팔로워·ER·등급)를 함께 보여준다.
    // 계약만 보고 "이 사람 규모가 어느 정도였지"를 다시 리스트에서 찾아야 했던 문제를 없앤다.
    const linkedIds = [...new Set(contracts.map((c) => c.influencer_id).filter((id): id is string => !!id))];
    const influencerStats = linkedIds.length > 0 ? await getInfluencerStats(linkedIds) : [];

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
        influencerStats={influencerStats}
        initialOpenId={openId}
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
