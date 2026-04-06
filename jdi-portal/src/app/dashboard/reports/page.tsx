import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import ReportsPageClient from "@/components/dashboard/reports/ReportsPageClient";
import { getReports } from "@/lib/reports/queries";
import type { ReportWithProfile } from "@/lib/reports/types";

export default async function ReportsPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  let reports: ReportWithProfile[] = [];

  try {
    reports = await getReports(auth.supabase);
  } catch {
    // DB 오류 시 빈 데이터로 페이지 렌더링
  }

  return (
    <ReportsPageClient
      initialReports={reports}
      userId={auth.user.id}
      userRole={auth.profile.role}
    />
  );
}
