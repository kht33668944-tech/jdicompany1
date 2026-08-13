// 계약관리(범용) 서명 완료 계약서 사본 다운로드 — 상대방이 같은 서명 토큰으로 30일간 받을 수 있다.

import { NextResponse, type NextRequest } from "next/server";
import { getCompanySignedCopyUrl } from "@/lib/contracts/signService";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = await getCompanySignedCopyUrl(token);
  if (!url) {
    return NextResponse.json(
      { error: "다운로드할 수 없는 문서입니다. 담당자에게 문의해주세요." },
      { status: 404 },
    );
  }
  return NextResponse.redirect(url);
}
