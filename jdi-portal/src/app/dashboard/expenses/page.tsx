import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { getMonthRange } from "@/lib/utils/date";
import {
  getExpenseCategories,
  getExpensesByRange,
  getRangeKrwTotal,
  getRecurringExpenses,
} from "@/lib/expenses/queries";
import ExpensesPageClient from "@/components/dashboard/expenses/ExpensesPageClient";

export const metadata = { title: "지출관리 | JDI" };

export default async function ExpensesPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const now = new Date();
  const kstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const year = kstNow.getFullYear();
  const month = kstNow.getMonth() + 1;
  const { start, end } = getMonthRange(year, month);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevRange = getMonthRange(prevYear, prevMonth);

  try {
    const [expenses, categories, recurring, prevMonthTotal, profilesRes] = await Promise.all([
      getExpensesByRange(auth.supabase, start, end),
      getExpenseCategories(auth.supabase),
      getRecurringExpenses(auth.supabase),
      getRangeKrwTotal(auth.supabase, prevRange.start, prevRange.end),
      auth.supabase.from("profiles").select("id, full_name").eq("is_approved", true).order("full_name"),
    ]);
    if (profilesRes.error) throw profilesRes.error;

    return (
      <ExpensesPageClient
        initialExpenses={expenses}
        categories={categories}
        recurring={recurring}
        prevMonthTotal={prevMonthTotal}
        userId={auth.user.id}
        userRole={auth.profile.role}
        profiles={profilesRes.data ?? []}
        canViewSensitive={auth.profile.can_view_sensitive_expenses}
      />
    );
  } catch (error) {
    console.error("[expenses] 초기 데이터 로드 실패", error);
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-sm text-red-600">
        지출 데이터를 불러오지 못했습니다. 잠시 후 새로고침해주세요.
      </div>
    );
  }
}
