import { NextResponse } from "next/server";

// Vercel serverless 콜드 스타트 방지용 핑 엔드포인트
// - 외부 cron / Vercel cron 이 주기적으로 호출
// - 인증 불필요 (가벼운 200 응답만)
// - Node.js runtime 유지를 위해 아무 module도 import 하지 않음
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    ts: Date.now(),
  });
}
