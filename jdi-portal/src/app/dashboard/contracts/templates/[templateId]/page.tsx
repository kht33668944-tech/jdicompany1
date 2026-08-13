// 계약서 양식 편집 — 전체 화면 문서형 편집기.

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { listCompanyTemplates } from "@/lib/contracts/actions";
import ContractEditorScreen from "@/components/dashboard/contracts/ContractEditorScreen";

export const metadata = { title: "계약서 양식 편집 | JDI" };

export default async function EditCompanyTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");
  const { templateId } = await params;

  let template;
  try {
    // 양식은 목록 액션 하나로 내용까지 함께 오므로 별도 조회를 두지 않는다
    template = (await listCompanyTemplates()).find((t) => t.id === templateId);
  } catch (error) {
    console.error("[contracts/templates/edit] 양식 로드 실패", error);
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
        양식을 불러오지 못했습니다. 목록에서 다시 열어주세요.
      </div>
    );
  }

  if (!template) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        양식을 찾을 수 없습니다. 삭제되었을 수 있어요.
      </div>
    );
  }

  return (
    <ContractEditorScreen
      target={{
        mode: "template",
        templateId: template.id,
        title: template.title,
        content: template.content,
      }}
    />
  );
}
