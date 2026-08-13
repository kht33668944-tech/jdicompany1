// 서명 완료 계약서 사본 다운로드 — 인플루언서가 같은 서명 토큰으로 30일간 받을 수 있다.

import { NextResponse, type NextRequest } from "next/server";
import { getSignedCopyUrl } from "@/lib/influencer/contracts/documents/signService";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = await getSignedCopyUrl(token);
  if (!url) {
    return NextResponse.json(
      { error: "다운로드할 수 없는 문서입니다. 담당자에게 문의해주세요." },
      { status: 404 },
    );
  }
  return NextResponse.redirect(url);
}
