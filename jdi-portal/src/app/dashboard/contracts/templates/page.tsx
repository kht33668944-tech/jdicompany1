// 계약서 양식 라이브러리 — 무제한 등록·편집.

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { listCompanyTemplates } from "@/lib/contracts/actions";
import TemplateLibraryClient from "@/components/dashboard/contracts/TemplateLibraryClient";

export const metadata = { title: "계약서 양식 | JDI" };

export default async function CompanyTemplatesPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  let templates;
  try {
    templates = await listCompanyTemplates();
  } catch (error) {
    console.error("[contracts/templates] 초기 데이터 로드 실패", error);
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
        양식 데이터를 불러오지 못했습니다. 새로고침해 주세요.
      </div>
    );
  }
  return <TemplateLibraryClient initialTemplates={templates} />;
}
