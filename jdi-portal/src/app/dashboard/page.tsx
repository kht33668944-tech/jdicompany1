import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">대시보드</h1>
          <p className="text-slate-500 mb-6">환영합니다, {user.email}</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-brand-50 border border-brand-200">
              <p className="text-sm text-brand-600 font-medium">상품 관리</p>
              <p className="text-2xl font-bold text-brand-900 mt-1">--</p>
            </div>
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-sm text-emerald-600 font-medium">주문 처리</p>
              <p className="text-2xl font-bold text-emerald-900 mt-1">--</p>
            </div>
            <div className="p-4 rounded-xl bg-purple-50 border border-purple-200">
              <p className="text-sm text-purple-600 font-medium">고객 데이터</p>
              <p className="text-2xl font-bold text-purple-900 mt-1">--</p>
            </div>
          </div>

          <form action="/auth/signout" method="post" className="mt-8">
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
