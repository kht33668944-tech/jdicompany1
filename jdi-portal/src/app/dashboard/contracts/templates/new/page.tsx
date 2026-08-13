// 새 계약서 양식 만들기 — 빈 문서에서 시작(워드에서 복사해 붙여넣으면 조항이 자동 분리됨).

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { createEmptyContent } from "@/lib/contracts/constants";
import ContractEditorScreen from "@/components/dashboard/contracts/ContractEditorScreen";

export const metadata = { title: "새 계약서 양식 | JDI" };

export default async function NewCompanyTemplatePage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  return (
    <ContractEditorScreen
      target={{ mode: "template", templateId: null, title: "", content: createEmptyContent() }}
    />
  );
}
