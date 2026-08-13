// 계약관리(범용) 전자서명 공개 페이지 — 로그인 불필요(서명 토큰이 인가 수단).
// /sign/ 하위라 미들웨어 로그인 리다이렉트 제외에 자동 포함되고,
// 데이터 접근은 서버에서 service role 로만 한다(TMA /sign/[token] 과 동일 원칙).

import type { Metadata } from "next";
import { getCompanySignPageData } from "@/lib/contracts/signService";
import CompanySignPageClient from "@/components/sign/CompanySignPageClient";

export const metadata: Metadata = {
  title: "전자계약 서명 | JDI",
  robots: { index: false, follow: false },
};

export default async function CompanySignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getCompanySignPageData(token);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-bold text-slate-800">유효하지 않은 링크입니다</p>
          <p className="mt-2 text-sm text-slate-500">
            서명 링크가 취소되었거나 주소가 잘못되었어요.
            <br />
            담당자에게 새 링크를 요청해주세요.
          </p>
        </div>
      </div>
    );
  }

  return <CompanySignPageClient token={token} data={data} />;
}
