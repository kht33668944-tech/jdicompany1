// 계약관리 — 범용 계약서 목록/생성/발송. 서명 엔진은 TMA 전자서명과 공유(마이그 123).

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { listCompanyDocuments, listCompanyTemplates } from "@/lib/contracts/actions";
import ContractsGeneralPageClient from "@/components/dashboard/contracts/ContractsGeneralPageClient";

export const metadata = { title: "계약관리 | JDI" };

export default async function CompanyContractsPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  let documents;
  let templates;
  try {
    [documents, templates] = await Promise.all([listCompanyDocuments(), listCompanyTemplates()]);
  } catch (error) {
    console.error("[contracts] 초기 데이터 로드 실패", error);
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
        계약 데이터를 불러오지 못했습니다. 새로고침해 주세요.
      </div>
    );
  }
  return <ContractsGeneralPageClient initialDocuments={documents} templates={templates} />;
}
