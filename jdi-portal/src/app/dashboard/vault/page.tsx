import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthUser } from "@/lib/supabase/auth";
import { getCorporations, getDocuments, isGateConfigured } from "@/lib/vault/queries";
import { verifyUnlockToken } from "@/lib/vault/crypto";
import { VAULT_UNLOCK_COOKIE } from "@/lib/vault/constants";
import VaultPageClient from "@/components/dashboard/vault/VaultPageClient";

export const metadata = { title: "보관함 | JDI" };

export default async function VaultPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  try {
    const [corporations, documents, gateConfigured] = await Promise.all([
      getCorporations(auth.supabase),
      getDocuments(auth.supabase),
      isGateConfigured(auth.supabase),
    ]);

    const store = await cookies();
    const unlockToken = store.get(VAULT_UNLOCK_COOKIE)?.value;
    const initialUnlocked = verifyUnlockToken(unlockToken, auth.user.id);

    return (
      <VaultPageClient
        initialCorporations={corporations}
        initialDocuments={documents}
        gateConfigured={gateConfigured}
        initialUnlocked={initialUnlocked}
        isAdmin={auth.profile.role === "admin"}
      />
    );
  } catch (error) {
    console.error("[vault] 초기 데이터 로드 실패", error);
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-sm text-red-600">
        보관함 데이터를 불러오지 못했습니다. 잠시 후 새로고침해주세요.
      </div>
    );
  }
}
