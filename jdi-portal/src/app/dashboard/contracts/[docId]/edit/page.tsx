// 계약서 편집 — 전체 화면 문서형 편집기.

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { getCompanyDocument } from "@/lib/contracts/actions";
import ContractEditorScreen from "@/components/dashboard/contracts/ContractEditorScreen";
import ContractSentScreen from "@/components/dashboard/contracts/ContractSentScreen";

export const metadata = { title: "계약서 편집 | JDI" };

export default async function EditCompanyContractPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");
  const { docId } = await params;

  let doc;
  try {
    doc = await getCompanyDocument(docId);
  } catch (error) {
    console.error("[contracts/edit] 계약서 로드 실패", error);
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">
        계약서를 불러오지 못했습니다. 목록에서 다시 열어주세요.
      </div>
    );
  }

  // 발송된 계약서는 편집 대신 서명 링크를 보여준다.
  // (발송 직후에도 서버가 이 라우트를 다시 렌더링하므로 링크는 여기서 다시 만든다.)
  if (doc.status === "sent") return <ContractSentScreen doc={doc} />;

  if (doc.status !== "draft") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-base font-bold text-slate-800">편집할 수 없는 계약서예요</p>
        <p className="mt-1.5 text-sm text-slate-500">
          {doc.status === "signed"
            ? "서명이 끝난 계약서는 내용을 바꿀 수 없습니다(위·변조 방지)."
            : "취소된 계약서입니다."}
          <br />
          고쳐서 다시 보내려면 목록에서 <b>복제</b> 후 편집해주세요.
        </p>
      </div>
    );
  }

  return <ContractEditorScreen target={{ mode: "doc", doc }} />;
}
