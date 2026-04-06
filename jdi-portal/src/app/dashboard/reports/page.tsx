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
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-700 font-semibold">데이터를 불러오는 중 오류가 발생했습니다.</p>
        <p className="text-red-500 text-sm mt-1">잠시 후 다시 시도해주세요.</p>
      </div>
    );
  }

  return (
    <ReportsPageClient
      initialReports={reports}
      userId={auth.user.id}
      userRole={auth.profile.role}
    />
  );
}
