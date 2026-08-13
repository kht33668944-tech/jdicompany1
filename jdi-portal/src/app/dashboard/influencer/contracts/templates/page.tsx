import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import TemplatesEditorClient from "@/components/dashboard/influencer/contracts/TemplatesEditorClient";

export const metadata = { title: "계약서 양식 편집 | JDI" };

export default async function ContractTemplatesPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");
  return <TemplatesEditorClient />;
}
