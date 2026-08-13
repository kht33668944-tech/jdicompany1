// 인플루언서 전자서명 공개 페이지 — 로그인 불필요(서명 토큰이 인가 수단).
// 미들웨어 제외 목록(/sign)에 등록되어 있고, 데이터 접근은 서버에서 service role 로만 한다.

import type { Metadata } from "next";
import { getSignPageData } from "@/lib/influencer/contracts/documents/signService";
import SignPageClient from "@/components/sign/SignPageClient";

export const metadata: Metadata = {
  title: "전자계약 서명 | JDI",
  robots: { index: false, follow: false },
};

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getSignPageData(token);

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

  return <SignPageClient token={token} data={data} />;
}
